<template >
  <div>
    <div class="block text-gray-700 text-sm mx-auto" v-if="step === 0">
        <img class="mx-auto" src="/loading.gif">
    </div>
    <div v-if="step > 0">
      <h2 class="block text-gray-700 text-2xl font-bold mb-2">{{projectName}} Vote</h2>
    </div>
    <div v-if="step === 1">
        <div class="block text-gray-700 text-sm mb-5">
          Your vote is associated with your Solana wallet address. Connect your wallet to cast your vote.
        </div>
        <div class="block text-gray-700 text-sm mb-5">
          <v-dialog
            v-model="dialog"
            persistent
            max-width="305"
          >
            <template v-slot:activator="{ on, attrs }">
              <v-btn
                color="primary"
                dark
                v-bind="attrs"
                v-on="on"
              >
                Connect Wallet
              </v-btn>
            </template>
            <v-card>
              <v-card-title class="text-h5">
                Choose a Wallet
              </v-card-title>
              <v-card-text>The wallet will be used as login credentials for your vote.</v-card-text>
              <v-card-actions>
                <v-btn color="green darken-1" text @click="connectWallet('phantom')">Phantom</v-btn>
                <v-btn color="green darken-1" text @click="connectWallet('solflare')">Solflare</v-btn>
                <v-btn color="green darken-1" text @click="connectWallet('slope')">Slope</v-btn>
              </v-card-actions>
            </v-card>
          </v-dialog>
        </div>
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
        <div class="block text-gray-700 text-sm mb-2">
          Print out the form details...
        </div>
        <v-btn color="primary" @click="submitForm">Save</v-btn>
        <v-btn color="grey" @click="disconnectWallet">Disconnect</v-btn>
      </form>
    </div>
    <div v-if="step === 4">
      <div class="block text-gray-700 text-sm mb-2">
        Error saving your vote. Try again later.
      </div>
    </div>
    <div v-if="step === 5">
        <h2 class="block text-gray-700 text-2xl font-bold mb-2">All set!</h2>
        <div class="block text-gray-700 text-sm mb-2">
          Successfully created project.
        </div>
    </div>
    <div v-if="step === 6">
      <div class="block text-gray-700 text-sm mb-2">
        Project not found.
      </div>
    </div>
    <div v-if="step === 7">
      <div class="block text-gray-700 text-sm mb-2">
        No votes found.
      </div>
    </div>
    <div class="block text-gray-700 text-sm" v-if="step === 11">
      We're having trouble connecting to your wallet. The currently supported wallets are <a class="hyperlink" href="https://phantom.app">Phantom</a>, <a class="hyperlink" href="https://solflare.com">Solflare</a> and <a class="hyperlink" href="https://slope.finance">Slope</a>. When using a mobile device, please ensure the current browser is supported by your wallet.
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import axios from 'axios'
import Solflare from '@solflare-wallet/sdk';
const { binary_to_base58 } = require('base58-js')

export default Vue.extend({
  data() {
    return {
      step: 0,
      signature: '',
      publicKey: '',
      project: '',
      projectConfig: null,
      projectName: '',
      voteConfigResponse: null
    }
  },
  async mounted() {

    // Retrieve the project config based on wildcard path
    this.project = this.$route.path.replaceAll("/vote", "").replaceAll("/","")

    // retrieve project config
    try { 
      var projectConfig = await axios.get('/api/getProject?project=' + this.project)
      this.projectName = projectConfig.data.project_friendly_name
      this.projectConfig = projectConfig.data
    } catch (e) {
      console.log(e)
      this.step = 6
      return
    }

    // determine if user is already logged in
    try {
      let res = await axios.get('/api/getConnectedWallet')
      if (res.data) {
        if (res.data.publicKey && res.data.signature) {
          console.log(`wallet is connected ${res.data.publicKey}`)
          this.publicKey = res.data.publicKey
          this.signature = res.data.signature
          this.connectWallet("")
        }
      }
    } catch (e) {
      console.log("user is not logged in", e)
      this.step = 1
    }
  },
  methods: {
    async disconnectWallet() {
      try {
        let res = await axios.get('/api/disconnectWallet')
        this.publicKey = ''
        this.signature = ''
        this.voteConfigResponse = null
      } catch (e) {
        console.log("signature could not be validated", e) 
      }
      this.step = 1
    },
    async connectWallet(walletType:string) {
      
      if (!this.signature || !this.publicKey) {
        try {

          // determine the type of wallet
          let wallet 
          if (walletType == "phantom") {
            // connect to phantom wallet
            wallet = window.solana
          } else if (walletType == "slope"){
            // connect to slope wallet
            wallet = new window.Slope()
          } else {
            // connect to solflare wallet
            wallet = new Solflare();
          }

          // connect to the wallet interface
          await wallet.connect();
          this.step = 2
 
          // Signs message to verify authority
          const message = this.$config.message
          const encodedMessage = new TextEncoder().encode(message)
          const signedMessage = await wallet.signMessage(encodedMessage, 'utf8')
          
          // determine b58 encoded signature
          if (signedMessage.data && signedMessage.data.signature) {
            // slope format
            this.signature = signedMessage.data.signature
            this.publicKey = signedMessage.data.publicKey
          } else {
            // phantom and solflare format
            this.signature = binary_to_base58((signedMessage.signature)?signedMessage.signature:signedMessage)
            this.publicKey = wallet.publicKey.toString()
          }
          console.log(`publicKey=${this.publicKey}, signature=${this.signature}`)
          
          // pre-validate the signature
          try {
            let res = await axios.post('/api/connectWallet', {
              signature: this.signature,
              publicKey: this.publicKey
            })
            console.log("validated signature for wallet", this.publicKey)
          } catch (e) {
            console.log("signature could not be validated", e)
          }
        } catch (e) {
          console.log(e)
          this.step = 11
          return
        }
      }

      // determine if there is an existing project for user 
      let res 
      try{   
        res = await axios.post('/api/getProjectVotes', {
            signature: this.signature,
            publicKey: this.publicKey,
            // @ts-ignore
            project: this.project
          })
        this.voteConfigResponse = res.data
      }  catch(e) {
        console.log("retrieve project vote error", e)
      } 
      if (res?.status == 200) { 
        console.log("found vote configuration:", JSON.stringify(res.data))
        this.step = 3
        return
      }

      // no vote data found
      this.step = 7
    },
    async submitForm() {
        let res
        try{
          res = await axios.post('/api/castProjectVote', {
            signature: this.signature,
            publicKey: this.publicKey,
            // @ts-ignore
            project: this.project,
            // @ts-ignore
            id: 123,
            vote: 0,
          })
          this.voteConfigResponse = res.data
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
        this.step = 7
    }
  } 
})
</script>
