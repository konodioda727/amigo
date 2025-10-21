export interface ServerSendError {
  type: "error";
  /**
   * The error message to be displayed to the user.
   */
  message: string;
  /**
   * Optional technical details for debugging.
   */
  details?: string;
}