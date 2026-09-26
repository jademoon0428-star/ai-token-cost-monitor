AI Cost Management
version v1.1.0
==================

1. This is AI Cost Management, version v1.1.0.

2. What is new in v1.1.0
   - DeepSeek official usage export ZIP import.
   - The Usage page now has a permanent "Import official usage export" entry.
   - Preview import writes nothing; Confirm writes to your local database.

3. Install
   - The Setup.exe and Payload.cab files must be in the same directory.
   - Double-click AI-Cost-Management-Setup.exe.
   - No administrator rights are required for the default install.

4. After installation
   - The application is installed to:
     %LOCALAPPDATA%\AI-Cost-Management\App

5. User data
   - Your cost history data is stored in:
     %APPDATA%\AI-Cost-Management\data
   - Uninstalling the application does NOT delete your cost history data.

6. Upgrade
   - Close AI Cost Management, then run Setup again.
   - If the application is still running, Setup will refuse to change anything
     and will not overwrite files that are in use.

7. Uninstall
   - This release uses uninstall.cmd (shipped with the developer/verification kit).
   - Uninstall only removes the application files and the Start Menu shortcut.
   - Your user data is preserved.

8. Windows security notice
   - This release is not yet code-signed.
   - If Windows SmartScreen shows "Windows protected your PC", you may click
     "More info", review the publisher and download source, and then decide
     for yourself whether to run it.
   - Do NOT disable Windows security protections as a workaround.

9. Windows 11 Smart App Control
   - Strict security configurations (for example Smart App Control on new
     Windows 11 machines) may block unsigned applications from running.
   - Do not disable these system security features; verify the file source
     and integrity first.

10. File integrity
   - SHA256SUMS.txt contains the SHA-256 hashes of Setup.exe and
     AI-Cost-Management-Payload.cab so you can verify the downloaded files.
   - Check the hashes after download and before running Setup.