<template>
  <div class="bg-gray-100  flex-col">
    <AppHeader />
    <div class="flex h-screen justify-center items-center flex-col">
        <div class="w-full max-w-lg">
            <div class="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
            <Nuxt />
            </div>
        </div>
    </div>
    <AppFooter />
  </div>
</template>

<script lang="ts">
import Vue from "vue";
import AppHeader from "@/components/base/AppHeader.vue";
import AppFooter from "@/components/base/AppFooter.vue";
export default Vue.extend({
  components: {
    AppHeader,
    AppFooter
  }
});
</script>
<style>
  .hyperlink {
    @apply text-blue-600 underline
  }

  .hyperlink:visited {
    @apply text-purple-600
  }
</style>