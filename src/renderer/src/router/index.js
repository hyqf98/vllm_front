import { createRouter, createWebHashHistory } from "vue-router";

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  redirect: '/',
  routes: [
    {
      path: "/",
      name: "登录",
      component: () => import("@renderer/views/login/Login.vue"),
    }
  ]
})

export default router;
