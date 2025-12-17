const fs = require("fs");
const path = require("path");

const ensureDir = (dirPath) => {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {}
  return dirPath;
};

const ensureProjectsDir = (getProjectsDir) => ensureDir(getProjectsDir());

const sanitizeProjectId = (projectName) =>
  `${Date.now()}-${String(projectName).replace(/[^a-zA-Z0-9-_]/g, "_")}`;

const safeReadJson = async (filePath) => {
  try {
    const content = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
};

const copyAssetInto = async (asset, destDir, fileNameBase) => {
  if (!asset || !asset.filePath) return null;

  const ext = path.extname(asset.filePath) || ".webm";
  const newFileName = `${fileNameBase}${ext}`;
  const newFilePath = path.join(destDir, newFileName);

  if (asset.filePath !== newFilePath) {
    await fs.promises.copyFile(asset.filePath, newFilePath);
  }

  return {
    ...asset,
    fileName: newFileName,
    filePath: newFilePath,
  };
};

const verifyAssetFilesExist = async (assets) => {
  if (!assets) return;
  for (const [assetType, asset] of Object.entries(assets)) {
    if (asset && asset.filePath) {
      try {
        await fs.promises.access(asset.filePath);
      } catch {
        assets[assetType] = null;
      }
    }
  }
};

const registerProjectsIpcHandlers = ({ ipcMain, dialog, getMainWindow, getProjectsDir, setProjectsDir }) => {
  ipcMain.handle("project:save", async (_event, { projectName, recording, existingProjectId }) => {
    const projectsDir = ensureProjectsDir(getProjectsDir);
    const isUpdate = Boolean(existingProjectId);
    const projectId = existingProjectId || sanitizeProjectId(projectName);
    const projectDir = path.join(projectsDir, projectId);

    try {
      await fs.promises.mkdir(projectDir, { recursive: true });

      let existingMetadata = null;
      if (isUpdate) {
        existingMetadata = await safeReadJson(path.join(projectDir, "project.json"));
      }

      const segments = recording.segments || [];
      const savedSegments = [];

      for (let i = 0; i < segments.length; i += 1) {
        const segment = segments[i];
        const segmentDir = path.join(projectDir, `segment-${i}`);
        await fs.promises.mkdir(segmentDir, { recursive: true });

        const savedAssets = {};
        for (const [assetType, asset] of Object.entries(segment.assets || {})) {
          try {
            const saved = await copyAssetInto(asset, segmentDir, assetType);
            if (saved) savedAssets[assetType] = saved;
          } catch (copyError) {
            console.error(`Failed to copy segment asset ${assetType}:`, copyError);
          }
        }

        savedSegments.push({
          ...segment,
          assets: savedAssets,
        });
      }

      const savedAssets = {};
      for (const [assetType, asset] of Object.entries(recording.assets || {})) {
        try {
          const saved = await copyAssetInto(asset, projectDir, assetType);
          if (saved) savedAssets[assetType] = saved;
        } catch (copyError) {
          console.error(`Failed to copy asset ${assetType}:`, copyError);
        }
      }

      const metadata = {
        id: projectId,
        name: projectName,
        createdAt: existingMetadata?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        duration: recording.duration,
        fileName: recording.fileName,
        events: recording.events || [],
        assets: savedAssets,
        segments: savedSegments,
        reviewState: recording.reviewState || existingMetadata?.reviewState || null,
        previewPath:
          savedAssets.screen?.filePath ||
          savedAssets.webcam?.filePath ||
          savedSegments[0]?.assets?.screen?.filePath ||
          null,
      };

      const metadataPath = path.join(projectDir, "project.json");
      await fs.promises.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

      return { success: true, projectId, projectDir, metadata };
    } catch (error) {
      console.error("Failed to save project:", error);
      throw error;
    }
  });

  ipcMain.handle("project:list", async () => {
    const projectsDir = ensureProjectsDir(getProjectsDir);
    const projects = [];

    try {
      const entries = await fs.promises.readdir(projectsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const metadata = await safeReadJson(path.join(projectsDir, entry.name, "project.json"));
        if (metadata) projects.push(metadata);
      }

      projects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return projects;
    } catch (error) {
      console.error("Failed to list projects:", error);
      return [];
    }
  });

  ipcMain.handle("project:load", async (_event, projectId) => {
    const projectsDir = ensureProjectsDir(getProjectsDir);
    const projectDir = path.join(projectsDir, projectId);
    const metadataPath = path.join(projectDir, "project.json");

    try {
      const metadata = await safeReadJson(metadataPath);
      if (!metadata) throw new Error("Failed to read project metadata");

      await verifyAssetFilesExist(metadata.assets);

      if (metadata.segments) {
        for (const segment of metadata.segments) {
          await verifyAssetFilesExist(segment.assets);
        }
      }

      return metadata;
    } catch (error) {
      console.error("Failed to load project:", error);
      throw error;
    }
  });

  ipcMain.handle("project:delete", async (_event, projectId) => {
    const projectsDir = ensureProjectsDir(getProjectsDir);
    const projectDir = path.join(projectsDir, projectId);

    try {
      await fs.promises.rm(projectDir, { recursive: true, force: true });
      return { success: true };
    } catch (error) {
      console.error("Failed to delete project:", error);
      throw error;
    }
  });

  ipcMain.handle("project:get-projects-dir", async () => {
    return ensureProjectsDir(getProjectsDir);
  });

  ipcMain.handle("project:change-dir", async () => {
    const mainWindow = getMainWindow?.() ?? null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
      title: "Select Projects Directory",
      defaultPath: getProjectsDir(),
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const newPath = result.filePaths[0];
      setProjectsDir(newPath);
      return newPath;
    }
    return null;
  });
};

module.exports = {
  registerProjectsIpcHandlers,
};
