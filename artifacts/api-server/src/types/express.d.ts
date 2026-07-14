declare global {
  namespace Express {
    interface User {
      id: string;
      githubId: number;
      login: string;
      name: string | null;
      email: string | null;
      avatarUrl: string;
      accessToken: string;
    }
  }
}

export {};
