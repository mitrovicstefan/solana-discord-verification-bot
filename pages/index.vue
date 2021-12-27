<template class="main">
  <div>
    <div class="twitter">
      Made By <a href="https://twitter.com/ProdEnv" class="underline">mitr◎vich 💖</a>. <a class="underline" href="https://twitter.com/ProdEnv">Twitter</a> | <a class="underline" href="https://github.com/mitrovicstefan">Github</a>
    </div>
    <div class="flex h-screen justify-center items-center flex-col">
      <div class="text-center" v-if="step === 1">
        Loading your discord username
      </div>

      <div class="text-center" v-if="step === 2">
        Getting your username
      </div>

      <div class="text-center" v-if="step > 2">
        <img alt="Discord profile pic" v-if="discordAvatar !== ''" class="rounded-full border-4 border-white w-20 my-0 mx-auto mb-4" :src="discordAvatar">
        {{discordUsername}}
      </div>

      <div class="text-center" v-if="step === 3">
        Connecting to phantom
      </div>
      <div class="text-center" v-if="step === 4">
        Please sign the message, this will verify that you're the owner of your wallet.<br>
        Review the message before signing and make sure that nothing else is requested except signature.
      </div>
      <div class="text-center" v-if="step === 5">
        You're done! You can close this window now
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

    // Get discord bearer token from url hash params
    const url_params: {access_token?: string} = this.$route.hash.split("&")
      .map(v => v.split("="))
      .reduce( (pre, [key, value]) => ({ ...pre, [key]: value }), {})
    if (!url_params.access_token) {
      const url = `https://discord.com/api/oauth2/authorize?client_id=${this.$config.client_id}&redirect_uri=${this.$config.redirect_uri}&response_type=token&scope=identify`
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
    }

    this.step = 4

    // Signs message to verify authority
    const message = this.$config.message
    const encodedMessage = new TextEncoder().encode(message)
    const signedMessage = await window.solana.signMessage(encodedMessage, 'utf8')

    // Sends signature to the backend
    let res2
    try {
      res2 = await axios.post('/api/logHodlers', {
        discordName: this.discordUsername,
        signature: signedMessage.signature,
        // @ts-ignore I honestly didn't wanna bother with strong typing this.. Feel free if you'd like
        publicKey: connection.publicKey.toString()
      })
    } catch (e) {
      console.log("API ERROR", e)
    }

    this.step = 5
  }
})
</script>

<style>
body {
  background: #23272A;
  color: #ffffff;
  position: relative;
}

.twitter {
  position: absolute;
  width: 100%;
  text-align: center;
  bottom: 10px;
}
</style>
