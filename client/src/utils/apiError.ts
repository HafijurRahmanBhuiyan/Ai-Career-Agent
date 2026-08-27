import axios from "axios";

export function getErrorMessage(
  err: unknown,
  fallback: string = "Something went wrong. Please try again."
): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined;
    if (data?.error) {
      return data.error;
    }
    if (err.code === "ECONNABORTED" || !err.response) {
      return "Unable to reach the server. Please check your connection.";
    }
  }
  return fallback;
}
