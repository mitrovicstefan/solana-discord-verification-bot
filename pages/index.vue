<template >
    <div>
        <h2 class="block text-gray-700 text-2xl font-bold mb-2">Welcome!</h2>
        <div class="block text-gray-700 text-sm mb-2">
        These are the FREE Solana NFT project tools you've been looking for. Click <a class=hyperlink href="/manage">manage</a> to setup your project.
        </div>
        <h2 class="block text-gray-700 text-lg font-bold mb-2">What is it?</h2>
        <div class="block text-gray-700 text-sm mb-2">
        The Discord verification service allows roles to be added to users who hold a specific NFT in their Solana wallet. These roles can be used to setup private channels and special features on your Discord server only available to your holders.
        </div>
        <h2 class="block text-gray-700 text-lg font-bold mb-2">How do I use it?</h2>
        <div class="block text-gray-700 text-sm mb-2">
        Once your project is configured, users can navigate to a custom URL to verify their NFT status on your Discord server. Your verified users are validated every 30 minutes to ensure the role is removed if your NFT is no longer in their wallet.
        </div>
        <h2 class="block text-gray-700 text-lg font-bold mb-2">Why is it free?</h2>
        <div class="block text-gray-700 text-sm mb-2">
        We're offering this free hosted service because we believe in giving back to the Solana NFT community. All NFT projects can use the service with a <b>limit of {{ this.$config.max_free_verifications }}</b> unique user verifications. Project owners holding one of our NFT's unlock unlimited verifications.
        </div>
        <h2 class="block text-gray-700 text-lg font-bold mb-2">Who are we?</h2>
        <div class="block text-gray-700 text-sm mb-2">
        At <a class="hyperlink" href="http://www.nft4cause.app">NFT 4 Cause</a> we create socially relevant NFTs to generate funds for global nonprofits. <b>Every NFT minted or traded on a secondary market is an 80% donation!</b> Everything else funds the development of tools like this to enhance the Solana community.
        </div>
        <h2 class="block text-gray-700 text-lg font-bold mb-2">Opensource</h2>
        <div class="block text-gray-700 text-sm mb-2">
        We believe in Opensource software, and the code for this service is freely <a class=hyperlink href="https://github.com/qrtp/solana-discord-verification-bot">available on GitHub</a>.
        </div>
    </div>
</template>