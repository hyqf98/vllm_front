/**
 * 模型市场 API
 * 统一支持 ModelScope 和 HuggingFace 两个平台
 */
import axios from 'axios'

// 平台配置
const PLATFORMS = {
  modelscope: {
    baseUrl: 'https://modelscope.cn/api/v1/dolphin/models',
    method: 'PUT',
    supportsPagination: true
  },
  huggingface: {
    baseUrl: 'https://huggingface.co/models-json',
    method: 'GET',
    supportsPagination: true
  }
}

/**
 * 统一的模型获取接口
 */
export async function getModels(platform, params = {}) {
  const { search = '', pageSize = 30, pageIndex = 0 } = params
  const config = PLATFORMS[platform]

  if (!config) {
    return {
      success: false,
      error: '不支持的平台',
      data: [],
      total: 0
    }
  }

  try {
    let requestConfig = {
      timeout: 15000,
      headers: {
        'Accept': 'application/json'
      }
    }

    let requestData = null
    let requestParams = null

    if (platform === 'modelscope') {
      // ModelScope PUT 请求
      requestData = {
        PageNumber: pageIndex + 1,  // ModelScope 页码从1开始
        PageSize: pageSize,
        SortBy: 'Default',
        Target: '',
        Name: search,
        Criterion: [],
        SingleCriterion: []
      }
      requestConfig.headers['Content-Type'] = 'application/json'
    } else {
      // HuggingFace GET 请求
      requestParams = {
        sort: 'trending',
        withCount: true
      }
      if (search && search.trim()) {
        requestParams.search = search
      }
      if (pageIndex !== undefined) {
        requestParams.p = pageIndex
      }
    }

    const response = await axios({
      method: config.method,
      url: config.baseUrl,
      data: requestData,
      params: requestParams,
      ...requestConfig
    })

    // 统一解析响应
    const result = parseResponse(platform, response.data)

    return result
  } catch (error) {
    console.error(`获取 ${platform} 模型失败:`, error.message)
    if (error.response) {
      console.error('响应状态:', error.response.status)
      console.error('响应数据:', error.response.data)
    }
    return {
      success: false,
      error: error.message,
      data: [],
      total: 0
    }
  }
}

/**
 * 统一的响应解析器
 */
function parseResponse(platform, data) {
  let models = []
  let totalCount = 0

  if (platform === 'modelscope') {
    // ModelScope 响应解析: { Data: { Model: { Models: [], TotalCount } } }
    if (data && data.Data && data.Data.Model) {
      const modelData = data.Data.Model
      models = modelData.Models || []
      totalCount = modelData.TotalCount || 0

      models = models.map(m => ({
        id: m.BackendSupport?.model_id || m.Path,
        modelId: m.BackendSupport?.model_id || m.Path,
        name: m.Name,
        description: m.Description || '',
        downloads: m.Downloads || 0,
        likes: m.Stars || 0,
        task: m.Tasks && m.Tasks.length > 0 ? m.Tasks[0].Name : null,
        author: m.Organization?.Name || m.CreatedBy,
        avatar: m.Organization?.Avatar || null
      }))
    }
  } else {
    // HuggingFace 响应解析: { models: [], numTotalItems }
    if (data && data.models) {
      models = data.models || []
      totalCount = data.numTotalItems || 0

      models = models.map(m => ({
        id: m.id,
        modelId: m.id,
        name: m.id.split('/').pop(),
        description: '',
        downloads: m.downloads || 0,
        likes: m.likes || 0,
        task: m.pipeline_tag,
        author: m.author,
        avatar: m.authorData?.avatarUrl || null
      }))
    }
  }

  return {
    success: true,
    data: models,
    total: totalCount
  }
}
