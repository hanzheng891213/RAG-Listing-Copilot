<script setup lang="ts">
import AppSidebar from './AppSidebar.vue'
import AppHeader from './AppHeader.vue'
</script>

<template>
  <div class="app-shell">
    <AppSidebar />
    <div class="main-area">
      <AppHeader />
      <main class="content">
        <router-view v-slot="{ Component }">
          <transition name="page-fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.main-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  margin-left: var(--sidebar-collapsed);
  min-width: 0;
  transition: margin-left var(--duration-slow) var(--ease-out);
}

.sidebar:hover ~ .main-area,
.app-shell:has(.sidebar:hover) .main-area {
  margin-left: var(--sidebar-expanded);
}

.content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 28px;
  background: transparent;
}

/* Page transition */
.page-fade-enter-active,
.page-fade-leave-active {
  transition:
    opacity var(--duration-normal) var(--ease-out),
    transform var(--duration-normal) var(--ease-out);
}

.page-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.page-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
