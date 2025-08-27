<script setup lang="ts">


const router = useRouter();

const handleClick = () => {
  router.push('/');
}

</script>

<template>
  <el-button type="primary" @click="handleClick">按钮</el-button>
</template>

