<template class="main">
  <div>
      <div class="block text-gray-700 text-sm mx-auto" v-if="step === 1">
        <img class="mx-auto" src="/loading.gif">
      </div>

      <div class="block text-gray-700 text-sm mx-auto" v-if="step === 2">
        <img class="mx-auto" src="/loading.gif">
      </div>

      <div class="block text-gray-700 text-sm" v-if="step > 2">
        <img alt="Discord profile pic" v-if="discordAvatar !== ''" class="rounded-full border-4 border-white w-20 my-0 mx-auto mb-4" :src="discordAvatar">
        <h2 class="block text-gray-700 text-2xl font-bold mb-2">{{discordUsername}}</h2>
      </div>

      <div class="block text-gray-700 text-sm mx-auto" v-if="step === 3">
        <img class="mx-auto" src="/loading.gif">
      </div>
      <div class="block text-gray-700 text-sm" v-if="step === 4">
        Please sign the message to verify that you're the owner of your wallet. We are about to make sure it holds the required tokens for your Discord validation.
        <br>
        <br>
        Review the message before signing and make sure that nothing else is requested except signature.
      </div>
      <div class="block text-gray-700 text-sm" v-if="step === 5">
        You're verified! You can close this window now and flex your new discord power.
      </div>
      <div class="block text-gray-700 text-sm" v-if="step === 6">
        Unfortunately your wallet doesn't have the tokens required for validation.
      </div>
      <div class="block text-gray-700 text-sm" v-if="step === 7">
        There is currently a problem communicating with the Discord API. Try again later.
      </div>
      <div class="block text-gray-700 text-sm" v-if="step === 8">
        Project not found.
      </div>
      <div class="block text-gray-700 text-sm" v-if="step === 9">
        Exceeded number of free verifications. Ask your project owner to get one of our NFTs to unlock unlimited verifications.
      </div>
      <div class="block text-gray-700 text-sm" v-if="step === 10">
        We're having trouble connecting to your wallet. The currently supported wallet configuration is <a class="hyperlink" href="https://phantom.app/">Phantom</a> with browser extension on a desktop or laptop device. Mobile support coming soon, and we are working to add support for additional wallet vendors!
        <br>
        <br>
        Please ensure Phantom is available on your device and try again.
      </div>
      <div class="block text-gray-700 text-sm mt-5" v-if="step > 2">
        <h2 class="block text-gray-700 text-lg font-bold mb-2">What is NFT 4 Cause?</h2>
        <div class="block text-gray-700 text-sm mb-2">
        At <a class="hyperlink" href="http://www.nft4cause.app">NFT 4 Cause</a> we create socially relevant NFTs to generate funds for global nonprofits. <b>Every NFT minted or traded on a secondary market is an 80% donation!</b> Everything else funds the development of tools like this to enhance the Solana community.
        </div>
      </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import axios from 'axios'

export default Vue.extend({
  data() {
    return {
      discordUsername: '',
      step: 1,
      discordAvatar: '',
    }
  },

  async mounted() {

    // Retrieve the project config based on wildcard path
    var projectName = this.$route.path.replaceAll("/","")
    var projectConfig
    try {
      projectConfig = await axios.get('/api/getProject?project=' + projectName)
    } catch (e) {
      console.log(e) 
    }

    // return not found if the project config is empty
    if (!projectConfig) {
      this.step = 8
      return
    }

    // Get discord bearer token from url hash params
    const url_params: {access_token?: string} = this.$route.hash.split("&")
      .map(v => v.split("="))
      .reduce( (pre, [key, value]) => ({ ...pre, [key]: value }), {})
    if (!url_params.access_token) {
      const url = `https://discord.com/api/oauth2/authorize?client_id=${projectConfig.data.discord_client_id}&redirect_uri=${projectConfig.data.discord_redirect_url}&response_type=token&scope=identify`
      window.location.href = url
    }

    // Get discord username from token
    let res = {data: {username: '', discriminator: '', id: '', avatar: ''}}
    try {
      res = await axios.get('https://discord.com/api/users/@me', {
        headers: {
          'Authorization': `Bearer ${url_params.access_token}`
        }
      })
    } catch (e) {
      console.log(e)
      return
    }
    this.step = 2
    this.discordUsername = `${res.data.username}#${res.data.discriminator}`
    this.discordAvatar = `https://cdn.discordapp.com/avatars/${res.data.id}/${res.data.avatar}.png`
    this.step = 3

    // Connects to phantom
    let connection
    try {
      connection = await window.solana.connect()
    } catch (e) {
      console.log(e)
      this.step = 10
      return
    }

    this.step = 4

    try {
      // Signs message to verify authority
      const message = projectConfig.data.message
      const encodedMessage = new TextEncoder().encode(message)
      const signedMessage = await window.solana.signMessage(encodedMessage, 'utf8')

      // Sends signature to the backend
      let res2
      try {
        res2 = await axios.post('/api/logHodlers', {
          projectName: projectName,
          discordName: this.discordUsername,
          signature: signedMessage.signature,
          // @ts-ignore I honestly didn't wanna bother with strong typing this.. Feel free if you'd like
          publicKey: connection.publicKey.toString()
        })
        console.log("Status:" + res2.status)
        if (res2.status == 200) {
          this.step = 5 
        } else if (res2.status == 500) { 
          this.step = 7 
        }
      } catch (e) {
        if (e.toString().includes("status code 403")) {
          this.step = 9
        } else if (e.toString().includes("status code 401")) {
          this.step = 6
        } else {
          console.log("API ERROR", e)
          this.step = 7
        }
      }
    } catch (e2) {
      console.log(e2)
      this.step = 10
    }
  }
})
</script>
