<template class="main">
  <div>
    <div class="twitter">
      Made By <a href="https://twitter.com/ProdEnv" class="underline">mitr◎vich 💖</a>. <a class="underline" href="https://twitter.com/ProdEnv">Twitter</a> | <a class="underline" href="https://github.com/mitrovicstefan">Github</a>
    </div>
    <div class="flex h-screen justify-center items-center flex-col">
      <div class="text-center" v-if="step === 1">
        Connecting to phantom
      </div>
      <div class="text-center" v-if="step === 2">
        Please sign the message, this will verify that you're the owner of your wallet.<br>
        Review the message before signing and make sure that nothing else is requested except signature.
      </div>
      <div class="text-center" v-if="step === 3">
        <form @submit.prevent="submitForm">
            <h2>Project info</h2>
            <input type="text" v-model="project" placeholder="Project">
            <input type="text" v-model="update_authority" placeholder="Update Authority">
            <input type="text" v-model="spl_token" placeholder="SPL Token">
            
            <h2>Discord server info</h2>
            <input type="text" v-model="discord_server_id" placeholder="Server ID">
            <input type="text" v-model="discord_role_id" placeholder="Role ID">

            <h2>Discord bot info</h2>
            <input type="text" v-model="discord_client_id" placeholder="Client ID">
            <input type="password" v-model="discord_bot_token" placeholder="Token">
            <button type="submit">Submit</button>
        </form>
      </div>
      <div class="text-center" v-if="step === 4">
        Error saving project. Try again later.
      </div>
      <div class="text-center" v-if="step === 5">
        Successfully created project.
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
      signature: '',
      publicKey: ''
    }
  },
  async mounted() {

    // waiting a short bit, there seems to be a race condition
    // if the connection below tries to load immediately.
    await new Promise(r => setTimeout(r, 250));

    // Connects to phantom 
    let connection
    try {
      connection = await window.solana.connect() 
    } catch (e) {
      console.log(e) 
    }

    this.step = 2

    // Signs message to verify authority
      const message = this.$config.message
      const encodedMessage = new TextEncoder().encode(message)
      const signedMessage = await window.solana.signMessage(encodedMessage, 'utf8')
      this.signature = signedMessage.signature
      // @ts-ignore
      this.publicKey = connection.publicKey.toString()
      this.step = 3
  },
  methods: {
    async submitForm() {

        let res 
        try{   
                res = await axios.post('/api/createProject', {
                    signature: this.signature,
                    publicKey: this.publicKey,
                    // @ts-ignore
                    project: this.project,
                    // @ts-ignore
                    update_authority: this.update_authority,
                    // @ts-ignore
                    spl_token: this.spl_token,
                    // @ts-ignore
                    discord_server_id: this.discord_server_id,
                    // @ts-ignore
                    discord_role_id: this.discord_role_id,
                    // @ts-ignore
                    discord_client_id: this.discord_client_id,
                    // @ts-ignore
                    discord_bot_token: this.discord_bot_token
                })
        } catch(e) {
            console.log("API ERROR", e)
            this.step = 4
            return
        }
        console.log("Status:" + res.status)
        this.step =5
    }
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
