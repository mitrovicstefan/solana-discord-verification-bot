<template>
  <header class="z-50 w-full shadow-lg bg-white">
    <v-app-bar
      color="#fcb69f"
      dark
      shrink-on-scroll
      src="https://picsum.photos/1920/1080?random"
      scroll-target="#scrolling"
    >
      <template v-slot:img="{ props }">
        <v-img
          v-bind="props"
          gradient="to top right, rgba(19,84,122,.5), rgba(128,208,199,.8)"
        ></v-img>
      </template>
      <v-toolbar-title>{{ this.$config.project_name }} | Solana Tools</v-toolbar-title>
      <v-spacer></v-spacer>
      <div>
        <div class="flex overflow-hidden duration-200 transition-height md:h-auto" :class="isExpanded ? 'h-500' : 'h-0'">
          <ul class="flex flex-col list-none md:flex-row">
            <li v-for="route in routes" :key="route.href" class="nowrap py-1 text-right">
              <a :href="route.href" class="px-3 navlink">
                {{ route.label }}
              </a>
            </li>
          </ul>
        </div>
      </div>
    </v-app-bar>
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
        { href: "/projects", label: "Leaderboard" },
        { href: this.$config.about_url, label: "About" },
        { href: this.$config.upgrade_url, label: "Donate!" }
      ]
    };
  }
};
</script>
<style>
  .navlink {
    @apply text-white text-lg font-semibold
  }
  .navlink:link{
    @apply text-white text-lg font-semibold
  }
  .navlink:hover{
    @apply text-white text-lg font-semibold underline
  }
  .navlink:visited {
    @apply text-white text-lg font-semibold
  }
</style>