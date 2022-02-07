<template >
    <div>
        <h2 class="block text-gray-700 text-2xl font-bold mb-2">Welcome!</h2>
        <div class="block text-gray-700 text-sm mb-2">
        Click <a class=hyperlink href="/manage">manage</a> to setup your FREE Discord verification service.
        </div>
        <h2 class="block text-gray-700 text-lg font-bold mb-2">What is it?</h2>
        <div class="block text-gray-700 text-sm mb-2">
        This service allows roles to be added to Discord users who hold a specific NFT in their Solana wallet. These roles can be used to setup private channels and special features on your Discord server only available to your holders.
        </div>
        <h2 class="block text-gray-700 text-lg font-bold mb-2">How do I use it?</h2>
        <div class="block text-gray-700 text-sm mb-2">
        Once your verification service is configured, Discord users can navigate to a custom URL to get verified. Users who hold your NFT in their wallet will receive a role on your Discord server. Your verified users are validated every 30 minutes to ensure the role is removed if your NFT is no longer in their wallet.
        </div>
        <h2 class="block text-gray-700 text-lg font-bold mb-2">Why is it free?</h2>
        <div class="block text-gray-700 text-sm mb-2">
        We're offering this free hosted service because we believe in giving back to the Solana NFT community. Anyone can setup a Discord verification service with a limit of <b>{{ this.$config.max_free_verifications }}</b> unique user verifications. Project owners holding one of our NFT's can unlock unlimited verifications.
        </div>
        <h2 class="block text-gray-700 text-lg font-bold mb-2">Who are we?</h2>
        <div class="block text-gray-700 text-sm mb-2">
        At <a class="hyperlink" href="http://www.nft4cause.app">NFT 4 Cause</a> we create socially relevant NFTs to generate funds for global nonprofit donations. Every NFT minted or traded on secondary market funds our DAO treasury at 80%! Our holders CHOOSE where to donate funds.
        </div>
        <h2 class="block text-gray-700 text-lg font-bold mb-2">Opensource</h2>
        <div class="block text-gray-700 text-sm mb-2">
        We believe in Opensource software, and the code for this service is freely <a class=hyperlink href="https://github.com/qrtp/solana-discord-verification-bot">available on GitHub</a>.
        </div>
    </div>
</template>