<template >
    <div>
        <h2 class="block text-gray-700 text-2xl font-bold mb-2">Connecting Twitter</h2>
        <div class="block text-gray-700 text-sm mx-auto" v-if="step === 1">
            <img class="mx-auto" src="/loading.gif">
        </div>
        <div class="block text-gray-700 text-sm mx-auto" v-if="step === 2">
            ✅ Successfully connected @{{userName}}!
        </div>
        <div class="block text-gray-700 text-sm mx-auto" v-if="step === 3">
            {{error}}
        </div>
        <div class="block text-gray-700 text-sm" v-if="step === 4">
            We're having trouble connecting to your wallet. The currently supported wallet configuration is <a class="hyperlink" href="https://phantom.app/">Phantom</a> with browser extension on a desktop or laptop device. Mobile support coming soon, and we are working to add support for additional wallet vendors!
            <br>
            <br>
            Please ensure Phantom is available on your device and try again.
        </div>
        <div class="block text-gray-700 text-sm" v-if="step === 5">
            Please sign the message to verify that you're the owner of your wallet. We will connect your Twitter account to the project associated with your wallet.
            <br>
            <br>
            Review the message before signing and make sure that nothing else is requested except signature.
        </div>
        
    </div>
</template>

<script lang="ts">

import Vue from 'vue'
import axios from 'axios';

export default Vue.extend({
  data() {
    return {
      step: 1,
      user: {},
      userName: '',
      accessToken: '',
      tokenSecret: '',
      signature: '',
      publicKey: '',
      error: null,
    };
  },
  async mounted() {

    try {
        // retrieve the twitter user's access key after OAuth is completed
        let res = await axios.get('/api/twitter/callback', {
        params: this.$route.query,
        })

        this.user = res.data.user;
        // @ts-ignore
        this.userName = this.user.username
        // @ts-ignore
        this.accessToken = this.user.access_token
        // @ts-ignore
        this.tokenSecret = this.user.token_secret
        this.step=2
    } catch (e) {
      this.error = e;
      this.step=3
      return  
    }

    // Connects to phantom 
    let connection
    try {
       connection = await window.solana.connect() 
    } catch (e) {
      console.log(e) 
      this.step=4
      return 
    }

    this.step = 5

    try {
        // Signs message to verify authority
        const message = this.$config.message
        const encodedMessage = new TextEncoder().encode(message)
        const signedMessage = await window.solana.signMessage(encodedMessage, 'utf8')
        this.signature = signedMessage.signature
        // @ts-ignore
        this.publicKey = connection.publicKey.toString()

        // save the access key
        let res2 = await axios.post('/api/updateProject', {
          // @ts-ignore I honestly didn't wanna bother with strong typing this.. Feel free if you'd like
          publicKey: connection.publicKey.toString(),
          signature: signedMessage.signature,
          twitterUsername: this.userName,
          twitterAccessToken: this.accessToken,
          twitterTokenSecret: this.tokenSecret
        })
        console.log(`saved twitter connection status: ${res2.status} `)
        if (res2.status == 200) {
          this.step = 2
        }
    } catch (e) {
        console.log(e)
        this.error = e
        this.step=3
        return
    }
  },
});
</script>