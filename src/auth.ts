import { CONFIG } from './config.js';

interface LoginResponse {
  statusCode?: number;
  success?: boolean;
  message?: string;
  data?: {
    accessToken?: string;
    token?: string;
    user?: any;
  };
  accessToken?: string;
  token?: string;
  requiresTwoFactor?: boolean;
  requiresInstanceSelection?: boolean;
}

interface SelectInstanceResponse {
  statusCode?: number;
  success?: boolean;
  message?: string;
  data?: {
    accessToken?: string;
    token?: string;
  };
  accessToken?: string;
  token?: string;
}

export class NabdaAuth {
  private baseUrl: string;
  private email: string;
  private password: string;
  private instanceId: string;
  private jwtToken: string | null = null;

  constructor() {
    this.baseUrl = CONFIG.NABDA_API_URL;
    this.email = CONFIG.NABDA_EMAIL;
    this.password = CONFIG.NABDA_PASSWORD;
    this.instanceId = CONFIG.NABDA_INSTANCE_ID;
  }

  async authenticate(): Promise<string> {
    if (this.jwtToken) {
      return this.jwtToken;
    }

    // Step 1: Login
    const loginResponse = await this.login();
    const tempToken = loginResponse.data?.accessToken || loginResponse.accessToken || loginResponse.token;
    
    if (!tempToken) {
      throw new Error('Login failed: No token received');
    }

    // Step 2: Select instance
    const selectResponse = await this.selectInstance(tempToken);
    const jwtToken = selectResponse.data?.accessToken || selectResponse.accessToken || selectResponse.token;
    
    if (!jwtToken) {
      throw new Error('Instance selection failed: No JWT token received');
    }

    this.jwtToken = jwtToken;
    return jwtToken;
  }

  private async login(): Promise<LoginResponse> {
    const url = `${this.baseUrl}/api/v1/auth/login`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: this.email,
        password: this.password,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Login failed: HTTP ${response.status} - ${error}`);
    }

    const data = await response.json() as LoginResponse;
    return data;
  }

  private async selectInstance(tempToken: string): Promise<SelectInstanceResponse> {
    const url = `${this.baseUrl}/api/v1/auth/select-instance`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tempToken}`,
      },
      body: JSON.stringify({
        instanceId: this.instanceId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Instance selection failed: HTTP ${response.status} - ${error}`);
    }

    const data = await response.json() as SelectInstanceResponse;
    return data;
  }

  getToken(): string | null {
    return this.jwtToken;
  }
}
