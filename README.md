# authorization-bot

This guide is WIP. It will be upgraded as time goes on. For any questions message me on twitter [@prodenv](https://twitter.com/prodenv)

## Prerequisites
1. Discord knowledge
2. Discord app and bot created and added to your server
3. Proper .env file
4. Mint list as .json array for your collection

## Wat do with mint list

Place it inside server-middleware/mint_list.json. It should just be an array of strings. Empty array is already there for you.

## How to set up .env file
I'll go over every parameter of .env.example and explain what it does and how to get it.
Needless to say, rename .env.example to .env and update values as per instruction -

### DISCORD_CLIENT_ID
If you go to [discord applications](https://discord.com/developers/applications) you can create an app there. Once you create an app and select it you can see application ID under `General Information`. Paste it here. It's the same thing as *CLIENT ID*. Those two are interchangeable.

### DISCORD_REDIRECT_URI
After you create your application go to OAuth2 section inside your app, there you will find redirects. Add your website here. And then you set it inside your .env

### MESSAGE_TO_SIGN
Any message here. It will be shown inside phantom when user has to sign it.

### DISCORD_BOT_TOKEN
BE CAREFUL NOT TO LEAK THIS!!!
Go inside "Bot" section of your app. Check both of Privileged Gateway Intents, save. Reveal token and paste it here.
Also worth mentioning that you should probably invite your bot to your server. Give at admin permissions when you invite it. Google it if you don't know how to do this.

### DISCORD_SERVER_ID
Your discord server ID.

DISCORD_ROLE_ID
ID of the role inside your discord server. [Here's how to find it](https://ozonprice.com/blog/discord-get-role-id/)

## Deployment

Guide soon. You can deploy it on vercel, your own server or anywhere else.

## Data storage

All of your hodlers will be inside hodlers.json file. Don't commit it if you don't wanna. It's for your own backup purposes.

## Build Setup

```bash
# install dependencies
$ yarn install

# serve with hot reload at localhost:3000
$ yarn dev

# build for production and launch server
$ yarn build
$ yarn start

# generate static project
$ yarn generate
```

For detailed explanation on how things work, check out the [documentation](https://nuxtjs.org).

## Special Directories

You can create the following extra directories, some of which have special behaviors. Only `pages` is required; you can delete them if you don't want to use their functionality.

### `assets`

The assets directory contains your uncompiled assets such as Stylus or Sass files, images, or fonts.

More information about the usage of this directory in [the documentation](https://nuxtjs.org/docs/2.x/directory-structure/assets).

### `components`

The components directory contains your Vue.js components. Components make up the different parts of your page and can be reused and imported into your pages, layouts and even other components.

More information about the usage of this directory in [the documentation](https://nuxtjs.org/docs/2.x/directory-structure/components).

### `layouts`

Layouts are a great help when you want to change the look and feel of your Nuxt app, whether you want to include a sidebar or have distinct layouts for mobile and desktop.

More information about the usage of this directory in [the documentation](https://nuxtjs.org/docs/2.x/directory-structure/layouts).


### `pages`

This directory contains your application views and routes. Nuxt will read all the `*.vue` files inside this directory and setup Vue Router automatically.

More information about the usage of this directory in [the documentation](https://nuxtjs.org/docs/2.x/get-started/routing).

### `plugins`

The plugins directory contains JavaScript plugins that you want to run before instantiating the root Vue.js Application. This is the place to add Vue plugins and to inject functions or constants. Every time you need to use `Vue.use()`, you should create a file in `plugins/` and add its path to plugins in `nuxt.config.js`.

More information about the usage of this directory in [the documentation](https://nuxtjs.org/docs/2.x/directory-structure/plugins).

### `static`

This directory contains your static files. Each file inside this directory is mapped to `/`.

Example: `/static/robots.txt` is mapped as `/robots.txt`.

More information about the usage of this directory in [the documentation](https://nuxtjs.org/docs/2.x/directory-structure/static).

### `store`

This directory contains your Vuex store files. Creating a file in this directory automatically activates Vuex.

More information about the usage of this directory in [the documentation](https://nuxtjs.org/docs/2.x/directory-structure/store).
