export const putTodoImage = async (
  bucket: R2Bucket,
  userId: string,
  todoId: string,
  image: File,
): Promise<string> => {
  const key = `${userId}/${todoId}/${crypto.randomUUID()}`;
  await bucket.put(key, image, { httpMetadata: { contentType: image.type } });
  return key;
};

export const getTodoImage = (bucket: R2Bucket, key: string): Promise<R2ObjectBody | null> =>
  bucket.get(key);

export const deleteTodoImage = async (bucket: R2Bucket, key: string): Promise<void> => {
  await bucket.delete(key);
};
