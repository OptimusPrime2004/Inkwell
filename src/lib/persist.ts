// src/lib/persist.ts
// Simple file-based persistence for project state (for dev/demo only)
import fs from 'fs';
import path from 'path';
import { UIProject } from './db-models';

const DATA_PATH = path.join(process.cwd(), '.inkwell-project.json');

// Ensure the project file's directory exists
const dataDir = path.dirname(DATA_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export async function saveProject(project: UIProject): Promise<void> {
  try {
    await fs.promises.writeFile(DATA_PATH, JSON.stringify(project, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving project:', error);
    throw new Error('Failed to save project state');
  }
}

export async function loadProject(): Promise<UIProject | null> {
  if (!fs.existsSync(DATA_PATH)) return null;
  
  try {
    const raw = await fs.promises.readFile(DATA_PATH, 'utf-8');
    const project = JSON.parse(raw) as UIProject;
    
    // Basic validation of loaded data
    if (!project || !Array.isArray(project.components)) {
      throw new Error('Invalid project data format');
    }
    
    return project;
  } catch (error) {
    console.error('Error loading project:', error);
    return null;
  }
}

export async function clearProject(): Promise<void> {
  try {
    if (fs.existsSync(DATA_PATH)) {
      await fs.promises.unlink(DATA_PATH);
    }
  } catch (error) {
    console.error('Error clearing project:', error);
    throw new Error('Failed to clear project state');
  }
}

// Clean up storage on process exit (optional, mainly for development)
if (process.env.NODE_ENV === 'development') {
  process.on('exit', () => {
    try {
      // Uncomment to clear state on exit (careful with this!)
      // clearProject();
    } catch (error) {
      console.error('Error in exit cleanup:', error);
    }
  });
}
