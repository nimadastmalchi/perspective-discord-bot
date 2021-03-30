# PerspectiveDiscordBot
A chat moderation bot that flags user messages in real-time according to the attributes that each message holds.

Author: Nima Dastmalchi

Instructions to activate:
  - Apply for an API key for Perspective API (https://www.perspectiveapi.com/).
  - Create a Discord bot user at https://discordapp.com/developers/applications/ and retrieve the Discord Token.
  - Copy these two keys on an .env file stored in the same directory as the source code in this format:
          PERSPECTIVE_API_KEY="xxxx"
          DISCORD_TOKEN="xxxx"
  - Once the bot is activated, you may see the commands available to you depending on your role permissions by 
    typing '!info' in any channel in the server (Administrative commands are available to some users).
