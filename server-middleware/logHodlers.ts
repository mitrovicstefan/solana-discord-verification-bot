const bodyParser = require("body-parser");
const app = require("express")();
import { Request, Response } from "express";
const fs = require("fs");
const nacl = require("tweetnacl");
const { PublicKey, Connection } = require("@solana/web3.js");
const { Client, Intents } = require("discord.js");

const mint_list = require("./mint_list.json");
const hodlerList = require("./hodlers.json");

// Create a new client instance
let allIntents = new Intents();
allIntents.add(
  Intents.FLAGS.GUILDS,
  Intents.FLAGS.GUILD_PRESENCES,
  Intents.FLAGS.GUILD_MESSAGES
);
const client = new Client({ intents: allIntents });

// Set the prefix
let prefix = "!";
let redirect_url = process.env.DISCORD_REDIRECT_URI;
client.on(
  "messageCreate",
  (message: {
    content: { startsWith: (prefix: string) => boolean };
    channel: any;
    author: any;
  }) => {
    // Exit and stop if the prefix is not there or if user is a bot
    if (!message.content.startsWith(prefix) || message.author.bot) return;

    if (message.content.startsWith(`${prefix}verify`)) {
      message.channel.send(
        `Hey ${message.author}, Visit ${redirect_url} to gain your special role!`
      );
    }
  }
);

// Login to Discord with your client's token
client.login(process.env.DISCORD_BOT_TOKEN);
// Endpoint to get all hodlers - protect it if you'd like
app.use(bodyParser.json());
app.get("/getHodlers", async (req: Request, res: Response) => {
  return res.json(hodlerList);
});

app.post("/logHodlers", async (req: Request, res: Response) => {
  const connection = new Connection(
    "https://sparkling-dark-shadow.solana-devnet.quiknode.pro/0e9964e4d70fe7f856e7d03bc7e41dc6a2b84452/"
  );

  const publicKeyString = req.body.publicKey;
  const signature = req.body.signature;
  const message = process.env.MESSAGE;
  const encodedMessage = new TextEncoder().encode(message);
  let publicKey = new PublicKey(publicKeyString).toBytes();
  const encryptedSignature = new Uint8Array(signature.data);

  // Validates signature sent from client
  const isValid = nacl.sign.detached.verify(
    encodedMessage,
    encryptedSignature,
    publicKey
  );
  if (!isValid) {
    return res.status(400);
  }

  const discordName = req.body.discordName;

  // Parses all tokens from that public key
  let matched = [];
  try {
    const tokenProgramId = new PublicKey(
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    );
    const tokenList = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(publicKeyString),
      {
        programId: tokenProgramId,
      }
    );
    for (let item of tokenList.value) {
      if (mint_list.includes(item.account.data.parsed.info.mint.toString()))
        matched.push(item);
    }
  } catch (e) {
    console.log("Error parsing NFTs", e);
  }

  // Basic ass way to find matched NFTs compared to the mint list ( PRs welcome <3 )

  // If matched NFTs are not empty and it's not already in the JSON push it
  if (matched.length !== 0) {
    let hasHodler = false;
    for (let n of hodlerList) {
      if (n.discordName === discordName) hasHodler = true;
    }
    if (!hasHodler) {
      hodlerList.push({
        discordName: discordName,
        publicKey: publicKeyString,
      });
    }
  } else {
    return res.sendStatus(401);
  }

  const username = discordName.split("#")[0];
  const discriminator = discordName.split("#")[1];

  // Update role
  const myGuild = await client.guilds.cache.get(process.env.DISCORD_SERVER_ID);
  const role = await myGuild.roles.cache.find(
    (r: any) => r.id === process.env.DISCORD_ROLE_ID
  );
  const doer = await myGuild.members.cache.find(
    (member: any) =>
      member.user.username === username &&
      member.user.discriminator === discriminator
  );
  await doer.roles.add(role);

  fs.writeFileSync(
    "./server-middleware/hodlers.json",
    JSON.stringify(hodlerList)
  );

  res.sendStatus(200);
});

app.get("/reloadHolders", async (req: Request, res: Response) => {
  const connection = new Connection(
    "https://sparkling-dark-shadow.solana-devnet.quiknode.pro/0e9964e4d70fe7f856e7d03bc7e41dc6a2b84452/"
  );
  for (let n in hodlerList) {
    const holder = hodlerList[n];
    let matched = [];
    try {
      const tokenProgramId = new PublicKey(
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
      );
      const tokenList = await connection.getParsedTokenAccountsByOwner(
        new PublicKey(holder),
        {
          programId: tokenProgramId,
        }
      );
      for (let item of tokenList.value) {
        if (mint_list.includes(item.account.data.parsed.info.mint.toString()))
          matched.push(item);
      }
    } catch (e) {
      console.log("Error parsing NFTs", e);
    }

    if (matched.length === 0) {
      hodlerList.splice(n, 1);
      const username = holder.discordName.split("#")[0];
      const discriminator = holder.discordName.split("#")[1];

      const myGuild = await client.guilds.cache.get(
        process.env.DISCORD_SERVER_ID
      );
      const role = await myGuild.roles.cache.find(
        (r: any) => r.id === process.env.DISCORD_ROLE_ID
      );
      const doer = await myGuild.members.cache.find(
        (member: any) =>
          member.user.username === username &&
          member.user.discriminator === discriminator
      );
      await doer.roles.remove(role);
    }

    fs.writeFileSync(
      "./server-middleware/hodlers.json",
      JSON.stringify(hodlerList)
    );

    res.status(200).send("Removed all paperhands b0ss");
  }
});

module.exports = app;
