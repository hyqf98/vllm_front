/**
 * 加密管理器
 * 使用 AES-256-GCM 算法加密敏感数据
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { app } from 'electron'
import * as os from 'os'

class CryptoManager {
  constructor() {
    this.algorithm = 'aes-256-gcm'
    this.keyLength = 32
    this.ivLength = 16
    this.salt = Buffer.from('vllm-front-salt-v1')
    this.key = this.deriveKey()
  }

  /**
   * 获取机器唯一标识
   * @returns {string} 机器标识
   */
  getMachineId() {
    try {
      // 尝试使用 Electron 的 getMachineId API（如果存在）
      if (typeof app.getMachineId === 'function') {
        return app.getMachineId()
      }
    } catch (error) {
      // 忽略错误，使用备用方案
    }

    // 备用方案：使用系统信息组合生成唯一标识
    const hostname = os.hostname()
    const platform = os.platform()
    const arch = os.arch()
    const userData = app.getPath('userData')

    // 组合多个因素生成稳定的机器标识
    return `${hostname}-${platform}-${arch}-${userData}`
  }

  /**
   * 从机器 ID 派生加密密钥
   * @returns {Buffer} 派生的密钥
   */
  deriveKey() {
    try {
      const machineId = this.getMachineId()
      return scryptSync(machineId, this.salt, this.keyLength)
    } catch (error) {
      console.error('派生加密密钥失败:', error)
      // 降级方案：使用默认密钥
      return scryptSync('default-key', this.salt, this.keyLength)
    }
  }

  /**
   * 加密文本
   * @param {string} text - 要加密的文本
   * @returns {Object} 加密数据 { data, iv, authTag }
   */
  encrypt(text) {
    if (!text) {
      return { data: '', iv: '', authTag: '' }
    }

    try {
      const iv = randomBytes(this.ivLength)
      const cipher = createCipheriv(this.algorithm, this.key, iv)

      let encrypted = cipher.update(text, 'utf8', 'hex')
      encrypted += cipher.final('hex')

      const authTag = cipher.getAuthTag()

      return {
        data: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      }
    } catch (error) {
      console.error('加密失败:', error)
      return { data: '', iv: '', authTag: '' }
    }
  }

  /**
   * 解密文本
   * @param {Object} encryptedData - 加密数据 { data, iv, authTag }
   * @returns {string} 解密后的文本
   */
  decrypt(encryptedData) {
    if (!encryptedData || !encryptedData.data) {
      return ''
    }

    try {
      const decipher = createDecipheriv(
        this.algorithm,
        this.key,
        Buffer.from(encryptedData.iv, 'hex')
      )

      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'))

      let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8')
      decrypted += decipher.final('utf8')

      return decrypted
    } catch (error) {
      console.error('解密失败:', error)
      return ''
    }
  }

  /**
   * 加密对象的指定字段
   * @param {Object} obj - 要加密的对象
   * @param {string[]} fields - 要加密的字段列表
   * @returns {Object} 加密后的对象
   */
  encryptObject(obj, fields = ['password', 'privateKey']) {
    if (!obj || typeof obj !== 'object') {
      return obj
    }

    const encrypted = { ...obj }

    fields.forEach(field => {
      if (encrypted[field] && typeof encrypted[field] === 'string') {
        encrypted[field] = this.encrypt(encrypted[field])
      }
    })

    return encrypted
  }

  /**
   * 解密对象的指定字段
   * @param {Object} obj - 要解密的对象
   * @param {string[]} fields - 要解密的字段列表
   * @returns {Object} 解密后的对象
   */
  decryptObject(obj, fields = ['password', 'privateKey']) {
    if (!obj || typeof obj !== 'object') {
      return obj
    }

    const decrypted = { ...obj }

    fields.forEach(field => {
      if (decrypted[field] && typeof decrypted[field] === 'object') {
        // 检查是否是加密数据格式
        if (decrypted[field].data && decrypted[field].iv && decrypted[field].authTag) {
          decrypted[field] = this.decrypt(decrypted[field])
        }
      }
    })

    return decrypted
  }

  /**
   * 加密服务器配置
   * @param {Object} server - 服务器配置
   * @returns {Object} 加密后的服务器配置
   */
  encryptServerConfig(server) {
    return this.encryptObject(server, ['password', 'privateKey'])
  }

  /**
   * 解密服务器配置
   * @param {Object} server - 服务器配置
   * @returns {Object} 解密后的服务器配置
   */
  decryptServerConfig(server) {
    return this.decryptObject(server, ['password', 'privateKey'])
  }

  /**
   * 批量加密服务器列表
   * @param {Array} servers - 服务器列表
   * @returns {Array} 加密后的服务器列表
   */
  encryptServerList(servers) {
    if (!Array.isArray(servers)) {
      return servers
    }

    return servers.map(server => this.encryptServerConfig(server))
  }

  /**
   * 批量解密服务器列表
   * @param {Array} servers - 服务器列表
   * @returns {Array} 解密后的服务器列表
   */
  decryptServerList(servers) {
    if (!Array.isArray(servers)) {
      return servers
    }

    return servers.map(server => this.decryptServerConfig(server))
  }

  /**
   * 生成随机密钥
   * @param {number} length - 密钥长度（字节）
   * @returns {string} 十六进制格式的密钥
   */
  generateRandomKey(length = 32) {
    return randomBytes(length).toString('hex')
  }

  /**
   * 哈希值（用于验证）
   * @param {string} text - 要哈希的文本
   * @returns {string} 哈希值
   */
  hash(text) {
    const { createHash } = require('crypto')
    return createHash('sha256').update(text).digest('hex')
  }
}

// 创建单例
const cryptoManager = new CryptoManager()

export default cryptoManager
