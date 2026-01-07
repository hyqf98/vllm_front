/**
 * 模型测试请求处理器
 * 在主进程中处理 HTTP 请求，避免渲染进程的 CORS 限制
 */
const { net } = require('electron')

class ModelTestHandler {
  /**
   * 规范化 URL，确保包含协议
   */
  normalizeUrl(url) {
    if (!url) return url

    // 如果 URL 不包含协议，添加 http://
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return `http://${url}`
    }
    return url
  }

  /**
   * 发送 HTTP 请求
   */
  async request(url, options = {}) {
    return new Promise((resolve, reject) => {
      const normalizedUrl = this.normalizeUrl(url)

      console.log('[ModelTestHandler] Request URL:', normalizedUrl)

      // 设置超时定时器
      let timeoutTimer = null
      const timeout = 60000

      const request = net.request({
        method: options.method || 'GET',
        url: normalizedUrl,
        headers: options.headers || {}
      })

      // 设置超时处理
      timeoutTimer = setTimeout(() => {
        request.abort()
        reject(new Error('Request timeout'))
      }, timeout)

      // 清除超时定时器
      const clearTimer = () => {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer)
          timeoutTimer = null
        }
      }

      // 发送请求体
      if (options.body) {
        request.write(options.body)
      }

      request.on('response', (response) => {
        clearTimer()
        let data = ''

        response.on('data', (chunk) => {
          data += chunk.toString()
        })

        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve({
              success: true,
              data: data,
              statusCode: response.statusCode
            })
          } else {
            reject(new Error(`HTTP ${response.statusCode}: ${data}`))
          }
        })

        response.on('error', (err) => {
          reject(err)
        })
      })

      request.on('error', (error) => {
        clearTimer()
        console.error('[ModelTestHandler] Request error:', error)
        reject(error)
      })

      request.on('close', () => {
        clearTimer()
      })

      request.end()
    })
  }

  /**
   * OpenAI 协议 - 测试连接
   */
  async testOpenAIConnection(serverUrl, apiKey, model) {
    const url = `${serverUrl}/chat/completions`
    const body = JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 5
    })

    const headers = {
      'Content-Type': 'application/json'
    }

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    try {
      const response = await this.request(url, {
        method: 'POST',
        headers: headers,
        body: body
      })

      const data = JSON.parse(response.data)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * OpenAI 协议 - 获取模型列表
   */
  async listOpenAIModels(serverUrl, apiKey) {
    const url = `${serverUrl}/models`
    const headers = {
      'Content-Type': 'application/json'
    }

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    try {
      const response = await this.request(url, {
        method: 'GET',
        headers: headers
      })

      const data = JSON.parse(response.data)
      return { success: true, data: data.data || [] }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * OpenAI 协议 - 聊天请求
   */
  async chatOpenAI(serverUrl, apiKey, model, messages, params, onDataCallback) {
    const url = this.normalizeUrl(`${serverUrl}/chat/completions`)
    const body = JSON.stringify({
      model: model,
      messages: messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 2000,
      top_p: params.topP ?? 1.0,
      frequency_penalty: params.frequencyPenalty ?? 0,
      presence_penalty: params.presencePenalty ?? 0,
      stream: params.stream ?? true
    })

    const headers = {
      'Content-Type': 'application/json'
    }

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    return new Promise((resolve, reject) => {
      let timeoutTimer = null
      const timeout = 120000

      const request = net.request({
        method: 'POST',
        url: url,
        headers: headers
      })

      timeoutTimer = setTimeout(() => {
        request.abort()
        reject(new Error('Request timeout'))
      }, timeout)

      const clearTimer = () => {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer)
          timeoutTimer = null
        }
      }

      let fullContent = ''
      let buffer = ''

      request.on('response', (response) => {
        clearTimer()

        if (response.statusCode !== 200) {
          let errorData = ''
          response.on('data', (chunk) => {
            errorData += chunk.toString()
          })
          response.on('end', () => {
            reject(new Error(`HTTP ${response.statusCode}: ${errorData}`))
          })
          return
        }

        response.on('data', (chunk) => {
          buffer += chunk.toString()

          // 处理 SSE 格式
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') continue

              try {
                const parsed = JSON.parse(data)
                const content = parsed.choices[0]?.delta?.content || ''
                if (content) {
                  fullContent += content
                  if (onDataCallback) onDataCallback(content)
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        })

        response.on('end', () => {
          resolve(fullContent)
        })

        response.on('error', (err) => {
          reject(err)
        })
      })

      request.on('error', (error) => {
        clearTimer()
        reject(error)
      })

      request.on('close', () => {
        clearTimer()
      })

      request.write(body)
      request.end()
    })
  }

  /**
   * Ollama 协议 - 测试连接
   */
  async testOllamaConnection(serverUrl, model) {
    const url = `${serverUrl}/api/chat`
    const body = JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: 'Hi' }]
    })

    try {
      const response = await this.request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body
      })

      const data = JSON.parse(response.data)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Ollama 协议 - 获取模型列表
   */
  async listOllamaModels(serverUrl) {
    const url = `${serverUrl}/api/tags`

    try {
      const response = await this.request(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = JSON.parse(response.data)
      return { success: true, data: data.models || [] }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Ollama 协议 - 聊天请求
   */
  async chatOllama(serverUrl, model, messages, params, onDataCallback) {
    const url = this.normalizeUrl(`${serverUrl}/api/chat`)
    const body = JSON.stringify({
      model: model,
      messages: messages,
      stream: params.stream ?? true,
      options: {
        temperature: params.temperature ?? 0.7,
        num_predict: params.numPredict ?? 2000,
        top_p: params.topP ?? 0.9,
        top_k: params.topK ?? 40,
        repeat_penalty: params.repeatPenalty ?? 1.1
      }
    })

    return new Promise((resolve, reject) => {
      let timeoutTimer = null
      const timeout = 120000

      const request = net.request({
        method: 'POST',
        url: url,
        headers: { 'Content-Type': 'application/json' }
      })

      timeoutTimer = setTimeout(() => {
        request.abort()
        reject(new Error('Request timeout'))
      }, timeout)

      const clearTimer = () => {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer)
          timeoutTimer = null
        }
      }

      let fullContent = ''
      let buffer = ''

      request.on('response', (response) => {
        clearTimer()

        if (response.statusCode !== 200) {
          let errorData = ''
          response.on('data', (chunk) => {
            errorData += chunk.toString()
          })
          response.on('end', () => {
            reject(new Error(`HTTP ${response.statusCode}: ${errorData}`))
          })
          return
        }

        response.on('data', (chunk) => {
          buffer += chunk.toString()

          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.trim()) continue

            try {
              const parsed = JSON.parse(line)
              const content = parsed.message?.content || ''
              if (content) {
                fullContent += content
                if (onDataCallback) onDataCallback(content)
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        })

        response.on('end', () => {
          resolve(fullContent)
        })

        response.on('error', (err) => {
          reject(err)
        })
      })

      request.on('error', (error) => {
        clearTimer()
        reject(error)
      })

      request.on('close', () => {
        clearTimer()
      })

      request.write(body)
      request.end()
    })
  }
}

export default new ModelTestHandler()
