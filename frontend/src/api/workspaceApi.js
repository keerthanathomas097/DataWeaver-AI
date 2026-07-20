import client from './client';

export async function getWorkspaces() {
  const { data } = await client.get('/workspaces/');
  return data;
}

export async function createWorkspace({ name, domain, description, color, iconName }) {
  const { data } = await client.post('/workspaces/', {
    name,
    research_domain: domain,
    description,
    color,
    icon_name: iconName,
  });
  return data;
}

export async function getWorkspace(workspaceId) {
  const { data } = await client.get(`/workspaces/${workspaceId}`);
  return data;
}
