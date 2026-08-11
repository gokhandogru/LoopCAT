export function createProjectRepository(projectApi) {
  if (!projectApi?.listProjects || !projectApi?.getProjectSegments) {
    throw new TypeError("ProjectRepository requires the LoopCAT project API.");
  }
  return Object.freeze({
    list: projectApi.listProjects.bind(projectApi),
    create: projectApi.createProject.bind(projectApi),
    update: projectApi.updateProject.bind(projectApi),
    remove: projectApi.deleteProject.bind(projectApi),
    removeDocument: projectApi.deleteProjectDocument.bind(projectApi),
    listSegments: projectApi.getProjectSegments.bind(projectApi),
    replaceSegments: projectApi.replaceProjectSegments.bind(projectApi),
    appendSegments: projectApi.appendProjectSegments.bind(projectApi),
    appendSegmentsAndUpdate: projectApi.appendProjectSegmentsAndUpdateProject.bind(projectApi),
    saveSegment: projectApi.saveSegment.bind(projectApi),
    saveSegments: projectApi.saveSegments.bind(projectApi),
    removeSegment: projectApi.deleteSegment.bind(projectApi)
  });
}
