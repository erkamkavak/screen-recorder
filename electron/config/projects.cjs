const { app } = require("electron");
const path = require("path");
const fs = require("fs");

const getConfigPath = () => {
  return path.join(app.getPath("userData"), "config.json");
};

const loadConfig = () => {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf-8");
      return JSON.parse(content);
    }
  } catch (error) {
    console.error("Failed to load config:", error);
  }
  return {};
};

const saveConfig = (config) => {
  try {
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to save config:", error);
  }
};

const getProjectsDir = () => {
  const config = loadConfig();
  if (config.projectsDir) {
    return config.projectsDir;
  }
  return path.join(app.getPath("documents"), "Clip Flow", "projects");
};

const setProjectsDir = (dirPath) => {
  const config = loadConfig();
  config.projectsDir = dirPath;
  saveConfig(config);
};

module.exports = {
  getProjectsDir,
  setProjectsDir,
};
