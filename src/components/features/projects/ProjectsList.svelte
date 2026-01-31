<script lang="ts">
  import { onMount } from "svelte";
  import { backendAPI, type ProjectMetadata } from "../../../lib/backend/backendAPI";
  import { lastRecording, appView, currentProject } from "../../../lib/stores";
  import { humanDuration } from "../../../lib/utils/duration";

  let projects: ProjectMetadata[] = [];
  let loading = true;
  let error: string | null = null;
  let deletingId: string | null = null;
  let currentDir: string | null = null;

  const loadProjects = async () => {
    loading = true;
    error = null;
    try {
      [projects, currentDir] = await Promise.all([
        backendAPI.listProjects(),
        backendAPI.getProjectsDir(),
      ]);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load projects";
    } finally {
      loading = false;
    }
  };

  const changeFolder = async () => {
    try {
      const newDir = await backendAPI.changeProjectsDir();
      if (newDir) {
        currentDir = newDir;
        loadProjects();
      }
    } catch (e) {
      console.error("Failed to change directory:", e);
    }
  };

  const openProject = async (project: ProjectMetadata) => {
    try {
      const loaded = await backendAPI.loadProject(project.id);
      lastRecording.set({
        assets: loaded.assets,
        events: loaded.events,
        duration: loaded.duration,
        fileName: loaded.fileName,
        previewPath: loaded.previewPath ?? undefined,
        segments: loaded.segments,
        projectId: loaded.id,
        reviewState: (loaded as any).reviewState,
      });
      currentProject.set({
        id: loaded.id,
        name: project.name,
        segments: loaded.segments,
        totalDuration: loaded.duration,
        fileName: loaded.fileName,
        previewPath: loaded.previewPath ?? undefined,
        reviewState: (loaded as any).reviewState,
      });
      appView.set("review");
    } catch (e) {
      console.error("Failed to load project:", e);
      error = e instanceof Error ? e.message : "Failed to load project";
    }
  };

  const deleteProject = async (projectId: string) => {
    if (!confirm("Are you sure you want to delete this project?")) return;
    deletingId = projectId;
    try {
      await backendAPI.deleteProject(projectId);
      projects = projects.filter((p) => p.id !== projectId);
    } catch (e) {
      console.error("Failed to delete project:", e);
    } finally {
      deletingId = null;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  onMount(() => {
    loadProjects();
  });
</script>

<div class="projects-list" data-testid="projects-list">
  <div class="projects-header">
    <h2>Saved Projects</h2>
    <div class="header-actions">
      <button class="icon-btn" on:click={changeFolder} title="Change projects folder">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </button>
      <button class="refresh-btn" on:click={loadProjects} disabled={loading}>
        {loading ? "Loading..." : "Refresh"}
      </button>
    </div>
  </div>

  {#if currentDir}
    <div class="current-dir" title={currentDir}>
      <span class="dir-label">Location:</span>
      <span class="dir-path">{currentDir}</span>
    </div>
  {/if}

  {#if error}
    <p class="error">{error}</p>
  {/if}

  {#if loading && !projects.length}
    <p class="loading">Loading projects...</p>
  {:else if projects.length === 0}
    <p class="empty">No saved projects yet. Record something and save it!</p>
  {:else}
    <ul class="projects">
      {#each projects as project, index (project.id)}
        <li class="project-item" data-testid={`project-item-${index + 1}`}>
          <button class="project-card" on:click={() => openProject(project)} data-testid="project-item">
            <div class="project-info">
              <span class="project-name">{project.name}</span>
              <span class="project-meta">
                {formatDate(project.createdAt)} · {humanDuration(Math.round(project.duration / 1000))}
              </span>
            </div>
            <div class="project-actions">
              <button
                class="delete-btn"
                on:click|stopPropagation={() => deleteProject(project.id)}
                disabled={deletingId === project.id}
              >
                {deletingId === project.id ? "..." : "×"}
              </button>
            </div>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .projects-list {
    background: white;
    border-radius: 16px;
    border: 1px solid #e5e7eb;
    padding: 1rem;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);
  }

  .projects-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .projects-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #1e293b;
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .icon-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
    background: white;
    color: #64748b;
    cursor: pointer;
    transition: all 0.15s;
    padding: 0;
  }

  .icon-btn:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
    color: #1e293b;
  }

  .refresh-btn {
    padding: 0.35rem 0.75rem;
    font-size: 0.8rem;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    background: white;
    color: #64748b;
    cursor: pointer;
    transition: all 0.15s;
  }

  .current-dir {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: #f8fafc;
    border: 1px solid #f1f5f9;
    border-radius: 6px;
    margin-bottom: 1rem;
    font-size: 0.75rem;
    color: #64748b;
  }

  .dir-label {
    font-weight: 600;
    color: #475569;
    white-space: nowrap;
  }

  .dir-path {
    font-family: monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .refresh-btn:hover:not(:disabled) {
    background: #f8fafc;
    border-color: #cbd5e1;
  }

  .refresh-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error {
    color: #ef4444;
    font-size: 0.85rem;
    margin: 0.5rem 0;
  }

  .loading,
  .empty {
    color: #64748b;
    font-size: 0.9rem;
    text-align: center;
    padding: 1.5rem 0;
  }

  .projects {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: min(520px, calc(100vh - 220px));
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .project-item {
    margin-bottom: 0.5rem;
  }

  .project-card {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    border-radius: 12px;
    border: 1px solid #f1f5f9;
    background: #f8fafc;
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
  }

  .project-card:hover {
    background: #f1f5f9;
    border-color: #e2e8f0;
  }

  .project-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
    min-width: 0;
  }

  .project-name {
    font-weight: 600;
    color: #1e293b;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .project-meta {
    font-size: 0.75rem;
    color: #64748b;
  }

  .project-actions {
    margin-left: 0.75rem;
  }

  .delete-btn {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: #94a3b8;
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .delete-btn:hover:not(:disabled) {
    background: #fee2e2;
    color: #ef4444;
  }

  .delete-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
