<template >
  <div>
    <div v-if="step === 1">
        <h2 class="block text-gray-700 text-2xl font-bold mb-2">Let's get started!</h2>
        <div class="block text-gray-700 text-sm mb-5">
          Your NFT project tools are associated with your Solana wallet address. Connect your wallet to login.
        </div>
        <div class="block text-gray-700 text-sm mb-5">
          <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline" @click="connectWallet" type="button">
            Connect Wallet
          </button>
        </div>
        <h2 class="block text-gray-700 text-xl font-bold mb-2">Show me how to do it</h2>
        <div class="block text-gray-700 text-sm mb-5">
          We've provided this video to show you how to get your Solana NFT project up and running with our tools in just 10 minutes.
        </div>
        <iframe width="100%" height="253" src="https://www.youtube.com/embed/QFRDIN4athM" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
    </div>
    <div v-if="step === 2">
      <h2 class="block text-gray-700 text-xl font-bold mb-2">Signature request</h2>
        <div class="block text-gray-700 text-sm mb-2">
          Please sign the message to verify that you're the owner of your wallet.
          <br>
          <br>
          Review the message before signing and make sure that nothing else is requested except signature.
        </div>
    </div>
    <div v-if="step === 3">
      <form @submit.prevent="submitForm" >
        <h2 class="block text-gray-700 text-xl font-bold mb-2">Configuration</h2>
        <div class="mb-4">
          <h2 class="block text-gray-700 text-sm font-bold mb-2">Project info</h2>
          <input class="mb-1 shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" type="text" v-model="project" v-if="!this.configResponse" placeholder="Project name">
          <input class="mb-1 shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" type="text" v-model="update_authority" placeholder="Update authority ID">
          <input class="mb-1 shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" type="text" v-model="royalty_wallet_id" placeholder="Royalty wallet ID">
          <input class="mb-1 shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" type="text" v-model="spl_token" placeholder="White list token ID">
        </div>
        <div class="mb-4">
          <h2 class="block text-gray-700 text-sm font-bold mb-2">Discord server info</h2>
          <input class="mb-1 shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" type="text" v-model="discord_server_id" placeholder="Discord server ID">
          <input class="mb-1 shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" type="text" v-model="discord_role_id" placeholder="Discord server role ID">
        </div>
        <div class="mb-4">
          <h2 class="block text-gray-700 text-sm font-bold mb-2">Discord bot info</h2>
          <input class="mb-1 shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" type="text" v-model="discord_client_id" placeholder="Discord bot client ID">
          <input class="mb-1 shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" type="password" v-model="discord_bot_token" placeholder="Discord bot token">
        </div>
          <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline" type="submit">Save</button>
      </form>
    </div>
    <div v-if="step === 4">
        <h2 class="block text-gray-700 text-xl font-bold mb-2">Oops, something went wrong</h2>
        <div class="block text-gray-700 text-sm mb-2">
          Error saving project. Try again later.
        </div>
    </div>
    <div v-if="step === 5">
        <h2 class="block text-gray-700 text-xl font-bold mb-2">All set!</h2>
        <div class="block text-gray-700 text-sm mb-2">
          Successfully created project.
        </div>
    </div>
    <div v-if="step === 6">
        <h2 class="block text-gray-700 text-xl font-bold mb-2">Oops, something went wrong</h2>
        <div class="block text-gray-700 text-sm mb-2">
          Error looking up user status.
        </div>
    </div>
    <div v-if="step === 7">
        <h2 class="block text-gray-700 text-xl font-bold mb-2">All set!</h2>
        <div class="block text-gray-700 text-sm mb-2">
          Successfully updated project.
        </div>
    </div>
    <div v-if="step === 8">
        <h2 class="block text-gray-700 text-xl font-bold mb-2">Looks like you already own a project</h2>
        <div class="block text-gray-700 text-sm mb-2">
          Update your existing project instead of creating a new one.
        </div>
    </div>
    <div v-if="step === 9">
        <h2 class="block text-gray-700 text-xl font-bold mb-2">Configuration already exists!</h2>
        <div class="block text-gray-700 text-sm mb-2">
          The project name or Discord server ID is already set up on our service. Try a new configuration.
        </div>
    </div>
    <div v-if="step === 10">
        <h2 class="block text-gray-700 text-xl font-bold mb-2">Invalid configuration</h2>
        <div class="block text-gray-700 text-sm mb-2">
          Double check your configuration values, something doesn't look right.
        </div>
    </div>
    <div v-if="this.configResponse">
        <br>
        <h2 class="block text-gray-700 text-xl font-bold mb-2">My verification URL</h2>
        <div class="block text-sm mb-2"> 
          <a class=hyperlink :href="this.discord_redirect_url">{{discord_redirect_url}}</a>
        </div>
        <div class="block text-gray-700 text-sm mb-2">
          Quota remaining: {{discord_remaining_verifications}}
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
      publicKey: '',
      isUpdate: false,
      project: '',
      update_authority: '',
      spl_token: '',
      royalty_wallet_id: '',
      discord_server_id: '',
      discord_role_id: '',
      discord_client_id: '',
      discord_bot_token: '',
      configResponse: null,
      discord_redirect_url: '',
      discord_remaining_verifications: ''
    }
  },
  async mounted() {
  },
  methods: {
    async connectWallet() {
     
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

      // determine if there is an existing project for user 
      let res 
      try{   
        res = await axios.get('/api/getProject?publicKey='+this.publicKey)
        this.configResponse = res.data
        this.discord_redirect_url = res.data.discord_redirect_url
        if (res.data.is_holder) {
          this.discord_remaining_verifications = "unlimited"
        } else {
          // @ts-ignore
          this.discord_remaining_verifications = this.$config.max_free_verifications - res.data.verifications
        }
      }  catch(e) {
        console.log("retrieve project error", e)
      } 
      if (res?.status == 200) { 
        console.log("found existing project:", JSON.stringify(res.data))
        this.isUpdate = true
        this.project = res.data.project
        this.update_authority = res.data.update_authority
        this.spl_token = res.data.spl_token
        this.royalty_wallet_id = res.data.royalty_wallet_id
        this.discord_server_id = res.data.discord_server_id
        this.discord_role_id = res.data.discord_role_id
        this.discord_client_id = res.data.discord_client_id
        this.discord_bot_token = res.data.discord_bot_token
      }
      this.step = 3
    },
    async submitForm() {
        let res 
        try{
          var url = (!this.isUpdate) ? '/api/createProject' : '/api/updateProject'
          res = await axios.post(url, {
            signature: this.signature,
            publicKey: this.publicKey,
            // @ts-ignore
            project: this.project,
            // @ts-ignore
            update_authority: this.update_authority,
            // @ts-ignore
            spl_token: this.spl_token,
            // @ts-ignore
            royalty_wallet_id: this.royalty_wallet_id,
            // @ts-ignore
            discord_server_id: this.discord_server_id,
            // @ts-ignore
            discord_role_id: this.discord_role_id,
            // @ts-ignore
            discord_client_id: this.discord_client_id,
            // @ts-ignore
            discord_bot_token: this.discord_bot_token
          })
          this.configResponse = res.data
          this.discord_redirect_url = res.data.discord_redirect_url
          if (res.data.is_holder) {
            this.discord_remaining_verifications = "unlimited"
          } else {
            // @ts-ignore
            this.discord_remaining_verifications = this.$config.max_free_verifications - res.data.verifications
          }
        } catch(e) {
            if (e.toString().includes("status code 409")) {
              this.step = 9
            } else if(e.toString().includes("status code 403")) {
              this.step = 8
            } else if(e.toString().includes("status code 400")) {
              this.step = 10
            } else {
              console.log("API ERROR", e)
              this.step = 4
            }
            return
        }
        console.log("Status:" + res.status)
        if (!this.isUpdate) {
          this.step = 5
        } else {
          this.step = 7
        }
        
    }
  } 
})
</script>
