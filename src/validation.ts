const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_TITLE_LENGTH = 200;

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
