module.exports = () => {
  if (!global.security) global.security = {};
  if (!global.antiBot) global.antiBot = {};
  if (!global.userMsgCount) global.userMsgCount = {};
  if (!global.userLastMsgTime) global.userLastMsgTime = {};
  if (!global.mutedUsers) global.mutedUsers = {};
};
