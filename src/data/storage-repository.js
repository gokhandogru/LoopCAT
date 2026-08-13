export function createStorageRepository(storageApi) {
  if (!storageApi?.get || !storageApi?.put) throw new TypeError("StorageRepository requires the LoopCAT storage API.");
  return Object.freeze({
    get: storageApi.get.bind(storageApi),
    getAll: storageApi.getAll.bind(storageApi),
    getAllByIndex: storageApi.getAllByIndex.bind(storageApi),
    deleteByKey: storageApi.deleteByKey.bind(storageApi),
    put: storageApi.put.bind(storageApi),
    bulkPut: storageApi.bulkPut.bind(storageApi),
    writeAtomically: storageApi.writeStoresAtomically.bind(storageApi),
    replaceAtomically: storageApi.replaceStoresAtomically.bind(storageApi),
    moveProjectToTrash: storageApi.moveProjectToTrash.bind(storageApi),
    moveProjectDocumentToTrash: storageApi.moveProjectDocumentToTrash.bind(storageApi),
    moveResourceRecordsToTrash: storageApi.moveResourceRecordsToTrash.bind(storageApi),
    restoreTrashRecords: storageApi.restoreTrashRecords.bind(storageApi),
    restoreResourceTrashRecords: storageApi.restoreResourceTrashRecords.bind(storageApi),
    constants: Object.freeze({ ...(storageApi.constants || {}) })
  });
}
