<template>
  <div>
    <div v-if="step === 1">
      Loading your discord username
    </div>

    <div v-if="step === 2">
      Getting your username
    </div>

    <div v-if="step > 2">
      Hello, {{discordUsername}}
    </div>

    <div v-if="step === 3">
      Connecting to phantom
    </div>

    <div v-if="step === 4">
      Waiting for signature
    </div>

    <div v-if="step === 5">
      You're done! You can close this window now
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
      step: 1
    }
  },
  async mounted() {

    // Get discord bearer token from url hash params
    const url_params: {access_token?: string} = this.$route.hash.split("&")
      .map(v => v.split("="))
      .reduce( (pre, [key, value]) => ({ ...pre, [key]: value }), {})
    if (!url_params.access_token) return

    // Get discord username from token
    let res = {data: {username: '', discriminator: ''}}
    try {
      res = await axios.get('https://discord.com/api/users/@me', {
        headers: {
          'Authorization': `Bearer ${url_params.access_token}`
        }
      })
    } catch (e) {
      console.log(e)
      return
    this.step = 2
    }
    this.discordUsername = `${res.data.username}#${res.data.discriminator}`

    this.step = 3

    // Checks if phantom is installed
    const isPhantomInstalled = window.solana && window.solana.isPhantom

    // Connects to phantom
    let connection
    try {
      connection = await window.solana.connect()
    } catch (e) {
      console.log(e)
    }

    this.step = 4

    // Signs message to verify authority
    const message = `test`
    const encodedMessage = new TextEncoder().encode(message)
    const signedMessage = await window.solana.signMessage(encodedMessage, 'utf8')

    // Sends signature to the backend
    let res2
    try {
      res2 = await axios.post('/test/logHodlers', {
        discordName: this.discordUsername,
        signature: signedMessage.signature,
        // @ts-ignore I honestly didn't wanna bother with typing this.. Feel free if you'd like
        publicKey: connection.publicKey.toString()
      })
    } catch (e) {
      console.log("API ERROR", e)
    }

    this.step = 5

    console.log(res2)
  }
})
</script>
