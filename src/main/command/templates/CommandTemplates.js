/**
 * 命令模板配置
 * 定义各种命令的模板格式
 */

const CommandTemplates = {
  // GPU 相关命令
  gpu: {
    nvidia: {
      query: {
        template: 'nvidia-smi --query-gpu={{fields}} --format=csv,noheader,nounits',
        fields: {
          basic: 'index,name,memory.total,memory.used,utilization.gpu',
          detailed: 'index,name,memory.total,memory.used,utilization.gpu,temperature.gpu,power.draw,power.limit',
          all: 'index,name,memory.total,memory.used,memory.free,utilization.gpu,utilization.memory,temperature.gpu,power.draw,power.limit,driver_version,mig.mode'
        }
      },
      processes: {
        template: 'nvidia-smi --query-compute-apps={{fields}} --format=csv,noheader,nounits',
        fields: {
          basic: 'pid,process_name,used_memory',
          detailed: 'pid,process_name,used_memory,gpu_uuid,device'
        }
      },
      stats: {
        template: 'nvidia-smi --query-gpu={{fields}} --format=csv,noheader,nounits -l {{interval}}',
        interval: 1
      }
    },
    amd: {
      query: {
        template: 'rocm-smi --showproductname --showmem --showuse --json'
      },
      processes: {
        template: 'rocm-smi --showpid --showmemuse --showuse --json'
      }
    },
    intel: {
      query: {
        template: 'intel_gpu_top -J'
      }
    }
  },

  // 环境管理命令
  environment: {
    conda: {
      list: {
        template: 'conda env list --json'
      },
      create: {
        template: 'conda create -n {{name}} python={{version}} -y'
      },
      remove: {
        template: 'conda env remove -n {{name}} -y'
      },
      install: {
        template: 'conda install -n {{env}} {{package}} -y'
      },
      uninstall: {
        template: 'conda remove -n {{env}} {{package}} -y'
      },
      listPackages: {
        template: 'conda list -n {{env}} --json'
      },
      config: {
        show: 'conda config --show {{key}} --json',
        add: 'conda config --add {{key}} {{value}}',
        remove: 'conda config --remove {{key}} {{value}}'
      }
    },
    uv: {
      list: {
        template: 'uv venv list --json'
      },
      create: {
        template: 'uv venv {{name}} --python {{version}}'
      },
      remove: {
        template: 'uv venv remove {{name}}'
      },
      install: {
        template: 'uv pip install --python {{env}} {{package}}'
      },
      uninstall: {
        template: 'uv pip uninstall --python {{env}} {{package}} -y'
      }
    },
    venv: {
      create: {
        template: '{{python}} -m venv {{name}}'
      },
      activate: {
        template: 'source {{path}}/bin/activate'
      },
      install: {
        template: '{{path}}/bin/pip install {{package}}'
      }
    }
  },

  // 系统信息命令
  system: {
    os: {
      linux: {
        info: 'uname -a',
        version: 'cat /etc/os-release',
        hostname: 'hostname'
      },
      darwin: {
        info: 'sw_vers',
        hostname: 'hostname'
      },
      windows: {
        info: 'systeminfo',
        hostname: 'hostname'
      }
    },
    cpu: {
      linux: {
        info: 'lscpu',
        usage: 'top -bn1 | grep "Cpu(s)"'
      },
      darwin: {
        info: 'sysctl -n machdep.cpu.brand_string',
        usage: 'top -l 1 | grep "CPU usage"'
      }
    },
    memory: {
      linux: 'free -b',
      darwin: 'vm_stat',
      windows: 'wmic memorychip get capacity'
    },
    disk: {
      linux: 'df -B1',
      darwin: 'df -B1',
      windows: 'wmic logicaldisk get size,freespace,caption'
    }
  },

  // 文件操作命令
  file: {
    list: {
      linux: 'ls -la {{path}}',
      darwin: 'ls -la {{path}}',
      windows: 'dir {{path}}'
    },
    read: {
      template: 'cat {{file}}'
    },
    write: {
      template: 'echo "{{content}}" > {{file}}'
    },
    delete: {
      template: 'rm -rf {{path}}'
    },
    copy: {
      template: 'cp {{source}} {{destination}}'
    },
    move: {
      template: 'mv {{source}} {{destination}}'
    },
    mkdir: {
      template: 'mkdir -p {{path}}'
    }
  },

  // 进程管理命令
  process: {
    list: 'ps aux',
    kill: 'kill {{signal}} {{pid}}',
    killByName: 'pkill {{name}}',
    run: {
      template: 'nohup {{command}} > {{log}} 2>&1 &',
      background: true
    }
  },

  // 网络命令
  network: {
    ping: {
      template: 'ping -c {{count}} {{host}}'
    },
    curl: {
      template: 'curl -X {{method}} {{url}} {{headers}} {{data}}'
    },
    wget: {
      template: 'wget -O {{output}} {{url}}'
    },
    port: {
      listen: 'netstat -tuln',
      connect: 'netstat -tun'
    }
  },

  // 日志命令
  log: {
    tail: {
      template: 'tail -n {{lines}} {{file}}'
    },
    follow: {
      template: 'tail -f {{file}}'
    },
    grep: {
      template: 'grep "{{pattern}}" {{file}}'
    }
  }
}

export default CommandTemplates
