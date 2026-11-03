# Windows Credential Manager access for lib/secrets.mjs. Usage: credential.ps1 get|set <service> <account>; `set` reads the value from stdin.
param([string]$Action, [string]$Service, [string]$Account)

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

public static class WhoseTurnCredential {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct CREDENTIAL {
    public UInt32 Flags;
    public UInt32 Type;
    public string TargetName;
    public string Comment;
    public FILETIME LastWritten;
    public UInt32 CredentialBlobSize;
    public IntPtr CredentialBlob;
    public UInt32 Persist;
    public UInt32 AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }

  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr credential);

  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredWrite(ref CREDENTIAL credential, UInt32 flags);

  [DllImport("advapi32.dll")]
  static extern void CredFree(IntPtr buffer);

  const UInt32 CRED_TYPE_GENERIC = 1;
  const UInt32 CRED_PERSIST_LOCAL_MACHINE = 2;

  public static string Read(string target) {
    IntPtr pointer;
    if (!CredRead(target, CRED_TYPE_GENERIC, 0, out pointer)) {
      return null;
    }
    try {
      CREDENTIAL credential = (CREDENTIAL)Marshal.PtrToStructure(pointer, typeof(CREDENTIAL));
      return Marshal.PtrToStringUni(credential.CredentialBlob, (int)credential.CredentialBlobSize / 2);
    } finally {
      CredFree(pointer);
    }
  }

  public static bool Write(string target, string user, string value) {
    IntPtr blob = Marshal.StringToCoTaskMemUni(value);
    try {
      CREDENTIAL credential = new CREDENTIAL();
      credential.Type = CRED_TYPE_GENERIC;
      credential.TargetName = target;
      credential.UserName = user;
      credential.CredentialBlob = blob;
      credential.CredentialBlobSize = (UInt32)(value.Length * 2);
      credential.Persist = CRED_PERSIST_LOCAL_MACHINE;
      return CredWrite(ref credential, 0);
    } finally {
      Marshal.ZeroFreeCoTaskMemUnicode(blob);
    }
  }
}
'@

$target = "$Service@$Account"

if ($Action -eq 'get') {
  $value = [WhoseTurnCredential]::Read($target)
  if ($null -eq $value) { exit 1 }
  [Console]::Out.Write($value)
  exit 0
}

if ($Action -eq 'set') {
  $value = [Console]::In.ReadToEnd()
  if ([WhoseTurnCredential]::Write($target, $Account, $value)) { exit 0 }
  exit 1
}

exit 2
