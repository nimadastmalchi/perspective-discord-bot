const { SSL_OP_DONT_INSERT_EMPTY_FRAGMENTS } = require('constants');
const Discord = require('discord.js');
const { UserRefreshClient } = require('googleapis-common');
const client = new Discord.Client();
const evaluator = require('./evaluator.js');
const PREFIX = '!'; // The prefix for commands

const reactionEmoji = '👎'
const attributesToReact = ['INSULT', 'TOXICITY', 'THREAT']

// boolean conditions:
let reactToMessage = false;

require('dotenv').config();

// An array of User objects
let users = [];

// key: channel
// element: true/false indicating moderation
let channelModeration = {};

class ServerUser {
    constructor(userid) {
        this.userid = userid;
        // attributeFlags has attributes as key and the number of occurences as element
        this.attributeFlags = {};
        this.sumOfScores = {};
        this.averageScores = {};
        for (let attribute in evaluator.attributeThresholds) {
            this.sumOfScores[attribute] = 0;
            this.averageScores[attribute] = 0;
        }
        this.numOfMessages = 0;
    }
    getUserid() {
        return this.userid;
    }
    getAttributeFlags() {
        return this.attributeFlags;
    }
    getAverageScores() {
        return this.averageScores;
    }
    addAttributes(attributesToAdd, scoresToAdd) {
        this.numOfMessages++;

        for (let key in attributesToAdd) {
            this.attributeFlags[attributesToAdd[key]] = this.attributeFlags[attributesToAdd[key]] ? this.attributeFlags[attributesToAdd[key]] + 1 : 1;
        }

        for (let attribute in scoresToAdd) {
            this.sumOfScores[attribute] += scoresToAdd[attribute];
            this.averageScores[attribute] = this.sumOfScores[attribute] / this.numOfMessages;
        }

        //console.log(this.attributeFlags);
        //console.log(this.sumOfScores);
        //console.log(this.averageScores);
    }
}

// Param: message to be analyzed.
// Analyzes the message, adds new user with new attributes or adds to existing user's attributes.
// Return: a list of attributes that were added.
async function flagUser(message) {
    // A listOfAttributesAdded to return
    let listOfAttributesAdded = [];

    let result;
    try {
        result = await evaluator.analyzeText(message.content);
    }
    catch (error) {
        console.log(error);
    }

    // flags is an object with the attributes as key and true/false elements.
    // scores is an object with the attributes as key and the score as elements
    let flags = result[0];
    let scores = result[1];

    for (let attribute in flags) {
        if (flags[attribute]) {
            listOfAttributesAdded.push(attribute);
        }
    }

    const userid = message.author.id;

    // Add the first user:
    if (users.length == 0) {
        users.push(new ServerUser(userid));
        users[0].addAttributes(listOfAttributesAdded, scores);
    }

    else {
        // Finding the user and adding the attributes:
        let found = false;
        for (const key in users) {
            if (users[key].getUserid() == userid) {
                users[key].addAttributes(listOfAttributesAdded, scores);
                found = true;
            }
        }
        // If new user, add to memory with new attributes
        if (!found) {
            let newUser = new ServerUser(userid);
            users.push(newUser);
            // Check if this actually changes the element in the array
            newUser.addAttributes(listOfAttributesAdded, scores);
        }
    }
    return listOfAttributesAdded;
}

// Param: The message to react to and the list of attributes added to the message.
// Reacts to the message according to the listOfAttributesAdded.
function react(message, listOfAttributesAdded) {
    if (listOfAttributesAdded.length == 0) {
        return;
    }

    for (let key in listOfAttributesAdded) {
        if (attributesToReact.includes(listOfAttributesAdded[key])) {
            message.react(reactionEmoji);
            return; // Don't want to react multiple times
        }
    }

    return;
}

client.on('ready', () => {
    console.log('Bot is now connected.');
});

client.on('message', async (message) => {
    // If message is not from server or is from bot, return
    if (!message.guild || message.author.bot) {
        return;
    }

    const channel = message.channel;
    // If channel is new, add to memory
    if (!(channel in channelModeration)) {
        channelModeration[channel] = true;
    }

    // If message is a command:
    const userid = message.author.id;
    if (message.content.startsWith(PREFIX)) {
        const [COMMAND, ...params] = message.content.trim().substring(PREFIX.length).split(/\s+/);
        // COMMAND is the first word after PREFIX, params is a list of the parameters of the command.

        // The supported commands are below:

        if (COMMAND.toLowerCase() == 'karma') {
            // If no parameters, the command is called on the users saying the command
            if (params.length == 0) {
                let recordExists = false;
                let indexOfSelf; // This is a User object and is the person using the karma command since params.length == 0
                // Loop through users and see if the user has any records:
                for (let key in users) {
                    // If the user is found:
                    if (users[key].getUserid() == userid) {
                        // If the user has a non-empty attributeFlags:
                        if (Object.keys(users[key].getAttributeFlags()).length != 0) {
                            recordExists = true;
                            indexOfSelf = key;
                        }
                        // If user does not have any attributeFlags, recordExists remains false.
                    }
                }
                // If recordExists, then send the attributeFlags:
                if (recordExists) {
                    let outputToCommand = `here's what I found for ` + message.author.username + ':\n';
                    let attributeFlags = users[indexOfSelf].getAttributeFlags();
                    for (attribute in attributeFlags) {
                        outputToCommand += '\t' + attribute + ' occurrences: ' + attributeFlags[attribute] + '\n';
                    }
                    message.reply(outputToCommand);
                }
                // If !recordExists, let the user know:
                else if (!recordExists) {
                    message.reply('I did not find any attributes from your messages.');
                }
            }

            // If there is a parameter, then it is the user that the command is called on (by another user):
            else if (params.length == 1) {
                if (message.mentions.members.first()) { // if there is at least one mentioned user.
                    let referredUserid = params[0].split('!')[1].split('>')[0]; // @User = !userid>
                    // username of the user:
                    let username = client.users.cache.find(user => user.id === referredUserid).username;
                    // foundUser is of type User:

                    let foundUser = users.find(user => user.getUserid() == referredUserid);

                    if (foundUser && Object.keys(foundUser.getAttributeFlags()).length != 0) { // If foundUser is defined and the user has attributes
                        let outputToCommand = `here's what I found for ` + username + ':\n';
                        let attributeFlags = foundUser.getAttributeFlags();
                        for (attribute in attributeFlags) {
                            outputToCommand += '\t' + attribute + ' occurrences: ' + attributeFlags[attribute] + '\n';
                        }
                        message.reply(outputToCommand);
                    }
                    else {
                        message.reply('I did not find any attributes for the messages of that user.');
                    }
                }

                else {
                    message.reply('incorrect syntax for this command. !info for help.');
                }
                
            }
        }

        if (COMMAND.toLowerCase() == 'scores') {
            // If no parameters, the command is called on the users saying the command
            if (params.length == 0) {
                let recordExists = false;
                let indexOfSelf; // This is a User object and is the person using the karma command since params.length == 0
                // Loop through users and see if the user has any records:
                for (let key in users) {
                    // If the user is found:
                    if (users[key].getUserid() == userid) {
                        // If the user has a non-empty averageScores:
                        if (Object.keys(users[key].getAverageScores()).length != 0) {
                            recordExists = true;
                            indexOfSelf = key;
                        }
                        // If user does not have any averageScores, recordExists remains false.
                    }
                }
                // If recordExists, then send the averageScores:
                if (recordExists) {
                    let outputToCommand = `Below are the average scores (from 0 to 1) the user ` + message.author.username + ' gets for each attribute in his or her messages:\n';
                    let averageScores = users[indexOfSelf].getAverageScores();
                    for (attribute in averageScores) {
                        outputToCommand += '\t' + attribute + ' average score: ' + Number(averageScores[attribute].toFixed(4)) + '\n';
                    }
                    message.reply(outputToCommand);
                }
                // If !recordExists, let the user know:
                else if (!recordExists) {
                    message.reply('I did not find any average scores from your messages.');
                }
            }

            // If there is a parameter, then it is the user that the command is called on (by another user):
            else if (params.length == 1) {
                if (message.mentions.members.first()) { // if there is at least one mentioned user.
                    let referredUserid = params[0].split('!')[1].split('>')[0]; // @User = !userid>
                    // username of the user:
                    let username = client.users.cache.find(user => user.id === referredUserid).username;
                    // foundUser is of type User:

                    let foundUser = users.find(user => user.getUserid() == referredUserid);

                    if (foundUser && Object.keys(foundUser.getAverageScores()).length != 0) { // If foundUser is defined and the user has average scores
                        let outputToCommand = `Below are the average scores (from 0 to 1) the user ` + username + ' gets for each attribute in his or her messages:\n';
                        let averageScores = foundUser.getAverageScores();
                        for (attribute in averageScores) {
                            outputToCommand += '\t' + attribute + ' messages: ' + Number(averageScores[attribute].toFixed(4)) + '\n';
                        }
                        message.reply(outputToCommand);
                    }
                    else {
                        message.reply('I did not find any average scores for the messages of that user.');
                    }
                }

                else {
                    message.reply('incorrect syntax for this command. !info for help.');
                }
                
            }
        }

        else if (COMMAND.toLowerCase() == 'react') {
            if (message.member.hasPermission('ADMINISTRATOR')) {
                if (params.length != 1) {
                    message.reply('incorrect number of parameters for this command. !info for help.');
                }
                else {
                    if (params[0] == 'on') {
                        if (reactToMessage) {
                            message.reply('reaction to messages is already toggled on');
                        }
                        else {
                            reactToMessage = !reactToMessage;
                            message.reply('reaction to message is now on');
                        }
                    }
                    else if (params[0] == 'off') {
                        if (!reactToMessage) {
                            message.reply('reaction to messages is already toggled off');
                        }
                        else {
                            reactToMessage = !reactToMessage;
                            message.reply('reaction to message is now off');
                        }
                    }
                    else {
                        message.reply('incorrect syntax for this command. !info for help.');
                    }
                }
            }
            else {
                message.reply('you do not have the permissions for this command.');
            }
        }

        else if (COMMAND.toLowerCase() == 'pause') {
            if (message.member.hasPermission('ADMINISTRATOR')) {
                // if channel is already not moderated, let the user know:
                if (!channelModeration[channel]) {
                    message.reply('moderation of this channel is already paused.');
                }
                // else, stop moderating this channel
                else {
                    channelModeration[channel] = false;
                    message.reply('moderation of this channel is now paused.');
                }
            }
            else {
                message.reply('you do not have the permissions for this command.');
            }
        }

        else if (COMMAND.toLowerCase() == 'unpause') {
            if (message.member.hasPermission('ADMINISTRATOR')) {
                // if channel is already being moderated, let the user know:
                if (channelModeration[channel]) {
                    message.reply('moderation of this channel is already unpaused.');
                }
                else {
                    channelModeration[channel] = true;
                    message.reply('moderation of this channel is now unpaused.');
                }
            }
            else {
                message.reply('you do not have the permissions for this command.');
            }
        }

        else if (COMMAND.toLowerCase() == 'moderatedchannels') {
            if (message.member.hasPermission('ADMINISTRATOR')) {
                let foundModeratedChannels = false;
                let outputToCommand = `here's a list of channels that are currently being moderated:\n`;
                for (channelElement in channelModeration) {
                    if (channelModeration[channelElement]) {
                        foundModeratedChannels = true;
                        outputToCommand += `\t${channelElement}` + '\n';
                    }
                }
                // if there is at least 1 moderated channel, print it:
                if (foundModeratedChannels) {
                    message.reply(outputToCommand);
                }
                // else, let the user know:
                else {
                    message.reply('there are no moderated channels currently.');
                }
            }
            else {
                message.reply('you do not have the permissions for this command.');
            }
        }

        else if (COMMAND.toLowerCase() == 'top') {
            if (users.length == 0) {
                message.reply('No data yet.');
            }
            else {
                if (params.length == 0) {
                    let output = 'here are the highest average scores of each user for each attribute:\n';
                    for (let attribute in evaluator.attributeThresholds) {
                        let max = users[0].getAverageScores()[attribute];
                        let maxUserIndex = 0;
                        for (let i = 1; i < users.length; i++) {
                            let value = users[i].getAverageScores()[attribute];
                            if (value > max) {
                                max = value;
                                maxUserIndex = i;
                            }
                        }
                        output += '\t' + attribute + ' highest average score: ' + Number(max.toFixed(4)) + ' by ' + client.users.cache.find(user => user.id === users[maxUserIndex].getUserid()).username + '.\n';
                    }
                    message.reply(output);
                }
                else {
                    console.reply('incorrect syntax for this command. !info for help.');
                }
            }
        }

        // HELP COMMAND
        else if (COMMAND.toLowerCase() == 'info') {
            let outputToCommand = 'here are some commands you can use:\n' + 
                                  '\t!karma: check your own attributes from your messages.\n' +
                                  '\t!karma @user: check the attributes of another user.\n' +
                                  '\t!scores: check the average scores of your messages.\n' +
                                  '\t!scores: check the average scores of another user.\n' +
                                  '\t!top: shows the highest average scores of the server.';
                                  
            if (message.member.hasPermission('ADMINISTRATOR')) {
                outputToCommand += '\n\t!react on: toggle on reaction to messages.\n' + 
                                   '\t!react off: toggle off reaction to messages.\n' +
                                   '\t!pause: toggle off channel moderation.\n' +
                                   '\t!unpause: toggle on channel moderation back.\n' +
                                   '\t!moderatedChannels: print a list of the currently moderated channels.\n' +
                                   '\t!reset: reset all attribute occurrence and average score data.';
            }
            message.reply(outputToCommand);
        }

        // RESET COMMAND
        else if (COMMAND.toLowerCase() == 'reset') {
            if (message.member.hasPermission('ADMINISTRATOR')) {
                if (params.length == 0) {
                    users.forEach(serverUser => serverUser = null); // GC takes care of this
                    users = [];
                    message.reply('all attribute data has been reset.');
                }
                else {
                    message.reply('incorrect syntax for this command. !info for help.');
                }
            }
            else {
                message.reply('you do not have permission for this command.');
            }
        }

        else {
            //message.reply('unknown command. !info for help.');
        }
    }

    // else: if the message is not a command. Update attributes.
    else {
    // If this channel is being moderated, add attributes to the user:
    if (channelModeration[channel]) {
        let listOfAttributesAdded = await flagUser(message);

        // If reaction to messages is toggled on, react to message:
        if (reactToMessage) {
            react(message, listOfAttributesAdded);
        }
    }
    }
});

client.login(process.env.DISCORD_TOKEN);