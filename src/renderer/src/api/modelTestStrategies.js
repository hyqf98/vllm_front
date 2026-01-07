/**
 * 模型测试策略基类
 */
class BaseModelStrategy {
  constructor(config) {
    this.config = config
  }

  /**
   * 发送聊天请求
   * @param {Array} messages - 消息历史
   * @param {Object} params - 高级参数
   * @param {Function} onChunk - 流式输出回调
   * @returns {Promise<String>} 完整回复
   */
  async chat(messages, params = {}, onChunk = null) {
    throw new Error('chat must be implemented')
  }

  /**
   * 测试连接
   */
  async testConnection() {
    throw new Error('testConnection must be implemented')
  }

  /**
   * 获取可用模型列表
   */
  async listModels() {
    throw new Error('listModels must be implemented')
  }
}

/**
 * OpenAI 协议策略
 * 使用 fetch API 直接调用
 */
class OpenAIStrategy extends BaseModelStrategy {
  async chat(messages, params = {}, onChunk = null) {
    const requestBody = {
      model: this.config.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 2000,
      top_p: params.topP ?? 1.0,
      frequency_penalty: params.frequencyPenalty ?? 0,
      presence_penalty: params.presencePenalty ?? 0,
      stream: params.stream ?? true
    }

    if (params.stream) {
      return await this._streamChat(requestBody, onChunk)
    } else {
      return await this._nonStreamChat(requestBody)
    }
  }

  async _streamChat(requestBody, onChunk) {
    const response = await fetch(`${this.config.serverUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey || 'sk-no-key-required'}`
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenAI API error: ${error}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullContent = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices[0]?.delta?.content || ''
            if (content) {
              fullContent += content
              if (onChunk) onChunk(content)
            }
          } catch (e) {
            // Ignore parse errors for keep-alive lines
          }
        }
      }
    }

    return fullContent
  }

  async _nonStreamChat(requestBody) {
    const response = await fetch(`${this.config.serverUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey || 'sk-no-key-required'}`
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenAI API error: ${error}`)
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || ''
  }

  async testConnection() {
    try {
      const response = await fetch(`${this.config.serverUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey || 'sk-no-key-required'}`
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5
        })
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error)
      }

      const data = await response.json()
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  async listModels() {
    try {
      const response = await fetch(`${this.config.serverUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey || 'sk-no-key-required'}`
        }
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error)
      }

      const data = await response.json()
      return { success: true, data: data.data || [] }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }
}

/**
 * Ollama 协议策略
 * 使用 fetch API 直接调用
 */
class OllamaStrategy extends BaseModelStrategy {
  async chat(messages, params = {}, onChunk = null) {
    const requestBody = {
      model: this.config.model,
      messages: messages,
      stream: params.stream ?? true,
      options: {
        temperature: params.temperature ?? 0.7,
        num_predict: params.numPredict ?? 2000,
        top_p: params.topP ?? 0.9,
        top_k: params.topK ?? 40,
        repeat_penalty: params.repeatPenalty ?? 1.1
      }
    }

    if (params.stream) {
      return await this._streamChat(requestBody, onChunk)
    } else {
      return await this._nonStreamChat(requestBody)
    }
  }

  async _streamChat(requestBody, onChunk) {
    const response = await fetch(`${this.config.serverUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Ollama API error: ${error}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullContent = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (!line.trim()) continue

        try {
          const parsed = JSON.parse(line)
          const content = parsed.message?.content || ''
          if (content) {
            fullContent += content
            if (onChunk) onChunk(content)
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }

    return fullContent
  }

  async _nonStreamChat(requestBody) {
    const response = await fetch(`${this.config.serverUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Ollama API error: ${error}`)
    }

    const data = await response.json()
    return data.message?.content || ''
  }

  async testConnection() {
    try {
      const response = await fetch(`${this.config.serverUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error)
      }

      const data = await response.json()
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  async listModels() {
    try {
      const response = await fetch(`${this.config.serverUrl}/api/tags`, {
        method: 'GET'
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error)
      }

      const data = await response.json()
      return { success: true, data: data.models || [] }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }
}

/**
 * 策略工厂
 */
const StrategyFactory = {
  strategies: {
    openai: OpenAIStrategy,
    ollama: OllamaStrategy
  },

  /**
   * 创建策略实例
   * @param {string} protocol - 协议类型
   * @param {Object} config - 配置
   * @returns {BaseModelStrategy}
   */
  create(protocol, config) {
    const StrategyClass = this.strategies[protocol]
    if (!StrategyClass) {
      throw new Error(`Unsupported protocol: ${protocol}`)
    }
    return new StrategyClass(config)
  },

  /**
   * 获取支持的协议列表
   */
  getSupportedProtocols() {
    return Object.keys(this.strategies)
  }
}

export default StrategyFactory
