import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import { createApp } from 'vue'
import router from './router'
import App from './App.vue'
import '@renderer/assets/base.scss'

const app = createApp(App)
app.use(ElementPlus)
app.use(router)

app.mount('#app')

