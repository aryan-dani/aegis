const CREDENTIAL_ID_KEY = "aegis.windowsHello.credentialId";

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toBase64Url(bytes: ArrayBuffer) {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function hasWindowsHelloCredential() {
  return Boolean(localStorage.getItem(CREDENTIAL_ID_KEY));
}

export function clearWindowsHelloCredential() {
  localStorage.removeItem(CREDENTIAL_ID_KEY);
}

export async function isWindowsHelloAvailable() {
  if (!window.isSecureContext || !window.PublicKeyCredential) {
    return false;
  }
  return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
}

export async function enrollWindowsHello() {
  if (!(await isWindowsHelloAvailable())) {
    throw new Error("Windows Hello is not available for this app window.");
  }

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: {
        name: "Aegis",
      },
      user: {
        id: randomBytes(32),
        name: "aegis-local-vault",
        displayName: "Aegis Local Vault",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "discouraged",
        requireResidentKey: false,
        userVerification: "required",
      },
      attestation: "none",
      timeout: 60_000,
    },
  });

  if (!credential || !(credential instanceof PublicKeyCredential)) {
    throw new Error("Windows Hello enrollment was cancelled.");
  }

  localStorage.setItem(CREDENTIAL_ID_KEY, toBase64Url(credential.rawId));
}

export async function verifyWindowsHello() {
  if (!(await isWindowsHelloAvailable())) {
    throw new Error("Windows Hello is not available for this app window.");
  }

  const credentialId = localStorage.getItem(CREDENTIAL_ID_KEY);
  if (!credentialId) {
    throw new Error("Windows Hello is not enrolled for this vault.");
  }

  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [
        {
          id: fromBase64Url(credentialId),
          type: "public-key",
          transports: ["internal"],
        },
      ],
      userVerification: "required",
      timeout: 60_000,
    },
  });

  if (!credential || !(credential instanceof PublicKeyCredential)) {
    throw new Error("Windows Hello verification was cancelled.");
  }
}
