const databaseName = "command-center-attachments-v1";
const storeName = "attachments";

function isIndexedDbAvailable() {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function openAttachmentDatabase() {
  if (!isIndexedDbAvailable()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open attachment database"));
  });
}

function runStoreOperation(mode, callback) {
  return openAttachmentDatabase().then((database) => {
    if (!database) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const result = callback(store);

      transaction.oncomplete = () => {
        database.close();
        resolve(result);
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error || new Error("Attachment database transaction failed"));
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error || new Error("Attachment database transaction aborted"));
      };
    });
  });
}

function createAttachmentStorageKey(attachment = {}) {
  return attachment.storageKey || attachment.id || `${attachment.kind || "file"}:${attachment.name || "attachment"}:${attachment.size || 0}`;
}

function createAttachmentReference(attachment = {}) {
  return {
    id: attachment.id,
    kind: attachment.kind,
    name: attachment.name,
    size: attachment.size,
    mimeType: attachment.mimeType,
    path: attachment.path,
    fullPath: attachment.fullPath,
    ...(attachment.truncated ? { truncated: attachment.truncated } : {}),
    storageKey: createAttachmentStorageKey(attachment),
  };
}

function hasInlineAttachmentPayload(attachment = {}) {
  return Boolean(attachment.dataUrl || attachment.previewUrl || attachment.textContent);
}

async function persistAttachmentReferences(attachments = [], keepKeys) {
  if (!attachments.length) {
    return [];
  }

  const references = attachments.map((attachment) => {
    const storageKey = createAttachmentStorageKey(attachment);
    keepKeys.add(storageKey);
    return createAttachmentReference({ ...attachment, storageKey });
  });

  if (!isIndexedDbAvailable()) {
    return attachments;
  }

  await runStoreOperation("readwrite", (store) => {
    attachments.forEach((attachment) => {
      if (!hasInlineAttachmentPayload(attachment)) {
        return;
      }

      const storageKey = createAttachmentStorageKey(attachment);
      store.put({
        key: storageKey,
        attachment: {
          ...attachment,
          storageKey,
        },
      });
    });
  });

  return references;
}

async function pruneAttachmentStorage(keepKeys) {
  if (!isIndexedDbAvailable()) {
    return;
  }

  await runStoreOperation("readwrite", (store) => {
    const request = store.getAllKeys();
    request.onsuccess = () => {
      const existingKeys = Array.isArray(request.result) ? request.result : [];
      existingKeys.forEach((key) => {
        if (!keepKeys.has(key)) {
          store.delete(key);
        }
      });
    };
  });
}

export async function serializeAttachmentStateForStorage(messages = [], pendingChatTurns = {}) {
  const serializedState = await serializeAttachmentStateByKeyForStorage({ active: messages }, pendingChatTurns);
  return {
    messages: serializedState.messagesByKey.active || [],
    pendingChatTurns: serializedState.pendingChatTurns,
  };
}

export async function serializeAttachmentStateByKeyForStorage(messagesByKey = {}, pendingChatTurns = {}) {
  const keepKeys = new Set();

  const serializedMessagesByKey = Object.fromEntries(
    await Promise.all(
      Object.entries(messagesByKey || {}).map(async ([key, messages]) => [
        key,
        await Promise.all(
          (messages || []).map(async (message) => {
            if (!message?.attachments?.length) {
              return message;
            }

            return {
              ...message,
              attachments: await persistAttachmentReferences(message.attachments, keepKeys),
            };
          }),
        ),
      ]),
    ),
  );

  const serializedPendingChatTurns = Object.fromEntries(
    await Promise.all(
      Object.entries(pendingChatTurns || {}).map(async ([key, entry]) => {
        const nextUserMessage = entry?.userMessage;
        if (!nextUserMessage?.attachments?.length) {
          return [key, entry];
        }

        return [
          key,
          {
            ...entry,
            userMessage: {
              ...nextUserMessage,
              attachments: await persistAttachmentReferences(nextUserMessage.attachments, keepKeys),
            },
          },
        ];
      }),
    ),
  );

  await pruneAttachmentStorage(keepKeys);

  return {
    messagesByKey: serializedMessagesByKey,
    pendingChatTurns: serializedPendingChatTurns,
  };
}

async function hydrateAttachmentReferences(attachments = []) {
  if (!attachments.length || !isIndexedDbAvailable()) {
    return attachments;
  }

  return Promise.all(
    attachments.map(
      (attachment) =>
        new Promise((resolve, reject) => {
          if (!attachment?.storageKey || hasInlineAttachmentPayload(attachment)) {
            resolve(attachment);
            return;
          }

          runStoreOperation("readonly", (store) => {
            const request = store.get(attachment.storageKey);
            request.onsuccess = () => {
              const storedAttachment = request.result?.attachment;
              resolve(storedAttachment ? { ...attachment, ...storedAttachment } : attachment);
            };
            request.onerror = () => reject(request.error || new Error("Failed to hydrate attachment reference"));
          }).catch(reject);
        }),
    ),
  );
}

export async function hydrateAttachmentStateFromStorage(messages = [], pendingChatTurns = {}) {
  const hydratedState = await hydrateAttachmentStateByKeyFromStorage({ active: messages }, pendingChatTurns);
  return {
    messages: hydratedState.messagesByKey.active || [],
    pendingChatTurns: hydratedState.pendingChatTurns,
  };
}

export async function hydrateAttachmentStateByKeyFromStorage(messagesByKey = {}, pendingChatTurns = {}) {
  if (!isIndexedDbAvailable()) {
    return {
      messagesByKey,
      pendingChatTurns,
    };
  }

  const hydratedMessagesByKey = Object.fromEntries(
    await Promise.all(
      Object.entries(messagesByKey || {}).map(async ([key, messages]) => [
        key,
        await Promise.all(
          (messages || []).map(async (message) => {
            if (!message?.attachments?.length) {
              return message;
            }

            return {
              ...message,
              attachments: await hydrateAttachmentReferences(message.attachments),
            };
          }),
        ),
      ]),
    ),
  );

  const hydratedPendingChatTurns = Object.fromEntries(
    await Promise.all(
      Object.entries(pendingChatTurns || {}).map(async ([key, entry]) => {
        const nextUserMessage = entry?.userMessage;
        if (!nextUserMessage?.attachments?.length) {
          return [key, entry];
        }

        return [
          key,
          {
            ...entry,
            userMessage: {
              ...nextUserMessage,
              attachments: await hydrateAttachmentReferences(nextUserMessage.attachments),
            },
          },
        ];
      }),
    ),
  );

  return {
    messagesByKey: hydratedMessagesByKey,
    pendingChatTurns: hydratedPendingChatTurns,
  };
}
