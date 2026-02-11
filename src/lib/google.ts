// Google OAuth 설정
const GOOGLE_CLIENT_ID = '315942796574-lj6bfde2nl36bnors1crjpne23ljmas4.apps.googleusercontent.com';

declare global {
  interface Window {
    google: any;
    gapi: any;
  }
}

export interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture: string;
  given_name: string;
  family_name: string;
}

class GoogleAuth {
  private isInitialized = false;
  private auth2: any = null;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    return new Promise((resolve, reject) => {
      // Google API 스크립트 로드
      if (!window.gapi) {
        const script = document.createElement('script');
        script.src = 'https://apis.google.com/js/api.js';
        script.onload = () => {
          window.gapi.load('auth2', () => {
            this.initAuth2().then(resolve).catch(reject);
          });
        };
        script.onerror = () => reject(new Error('Google API 스크립트 로드 실패'));
        document.head.appendChild(script);
      } else {
        window.gapi.load('auth2', () => {
          this.initAuth2().then(resolve).catch(reject);
        });
      }
    });
  }

  private async initAuth2(): Promise<void> {
    try {
      this.auth2 = await window.gapi.auth2.init({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'profile email'
      });
      this.isInitialized = true;
    } catch (error) {
      throw new Error('Google Auth2 초기화 실패');
    }
  }

  async login(): Promise<{ userInfo: GoogleUserInfo }> {
    await this.initialize();

    try {
      const authInstance = this.auth2;
      const googleUser = await authInstance.signIn();
      
      if (!googleUser.isSignedIn()) {
        throw new Error('구글 로그인이 취소되었습니다.');
      }

      const profile = googleUser.getBasicProfile();
      const userInfo: GoogleUserInfo = {
        id: profile.getId(),
        email: profile.getEmail(),
        name: profile.getName(),
        picture: profile.getImageUrl(),
        given_name: profile.getGivenName(),
        family_name: profile.getFamilyName()
      };

      return { userInfo };
    } catch (error: any) {
      if (error.error === 'popup_closed_by_user') {
        throw new Error('로그인 창이 닫혔습니다.');
      }
      throw new Error(error.message || '구글 로그인에 실패했습니다.');
    }
  }

  async logout(): Promise<void> {
    if (this.auth2 && this.isLoggedIn()) {
      await this.auth2.signOut();
    }
  }

  isLoggedIn(): boolean {
    return this.auth2 && this.auth2.isSignedIn.get();
  }

  getCurrentUser(): GoogleUserInfo | null {
    if (!this.isLoggedIn()) return null;

    const googleUser = this.auth2.currentUser.get();
    const profile = googleUser.getBasicProfile();
    
    return {
      id: profile.getId(),
      email: profile.getEmail(),
      name: profile.getName(),
      picture: profile.getImageUrl(),
      given_name: profile.getGivenName(),
      family_name: profile.getFamilyName()
    };
  }
}

export const googleAuth = new GoogleAuth();