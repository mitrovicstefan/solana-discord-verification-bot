<template>
  <header class="z-50 w-full shadow-lg bg-white">
    <nav class="container flex flex-wrap items-center justify-between px-2 py-3 mx-auto">
      <div class="flex justify-between w-full px-3 md:w-auto md:static md:block md:justify-start">
        <div class="inline-block py-2 text-lg font-bold">
          {{ this.$config.project_name }} | Discord Verification
        </div>
      </div>
      <div class="flex overflow-hidden duration-200 transition-height md:h-auto" :class="isExpanded ? 'h-24' : 'h-0'">
        <ul class="flex flex-col list-none md:flex-row">
          <li v-for="route in routes" :key="route.href" class="py-1 text-left">
            <a :href="route.href" class="px-3 font-semibold">
              {{ route.label }}
            </a>
          </li>
        </ul>
      </div>
    </nav>
  </header>
</template>

<script>
export default {
  data() {
    return {
      isExpanded: false,
      routes: [
        { href: "/", label: "Home" },
        { href: "/manage", label: "Manage" },
        { href: this.$config.about_url, label: "About Us" },
        { href: this.$config.upgrade_url, label: "Mint!" }
      ]
    };
  }
};
</script>

