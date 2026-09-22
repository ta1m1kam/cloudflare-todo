const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_TITLE_LENGTH = 200;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_API_KEY_NAME_LENGTH = 50;

export const validateCredentials = (email: string, password: string): string | null => {
  if (!EMAIL_PATTERN.test(email)) {
    return "メールアドレスの形式が正しくありません";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`;
  }
  return null;
};

export const validateTodoTitle = (title: string): string | null => {
  if (title.length === 0) {
    return "タイトルを入力してください";
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return `タイトルは${MAX_TITLE_LENGTH}文字以内で入力してください`;
  }
  return null;
};

export const validateImage = (image: File): string | null => {
  if (!ALLOWED_IMAGE_TYPES.includes(image.type)) {
    return "画像は JPEG / PNG / WebP / GIF のいずれかを選択してください";
  }
  if (image.size > MAX_IMAGE_SIZE) {
    return "画像は5MB以下のファイルを選択してください";
  }
  return null;
};

export const validateApiKeyName = (name: string): string | null => {
  if (name.length === 0) {
    return "キーの名前を入力してください";
  }
  if (name.length > MAX_API_KEY_NAME_LENGTH) {
    return `キーの名前は${MAX_API_KEY_NAME_LENGTH}文字以内で入力してください`;
  }
  return null;
};
