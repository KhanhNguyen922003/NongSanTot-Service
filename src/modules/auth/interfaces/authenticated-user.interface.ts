export interface AuthenticatedUser {
  uid: string;
  phoneNumber?: string;
  name?: string;
  firebase?: {
    sign_in_provider?: string;
  };
}
