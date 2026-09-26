using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;

class Bootstrapper
{
    const string PayloadName = "AI-Cost-Management-Payload.cab";
    const string AppExe = "AI Cost Management.exe";
    const string ShortcutName = "AI Cost Management.lnk";

    static int Main(string[] args)
    {
        string selfDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        string payload = Path.Combine(selfDir, PayloadName);
        if (!File.Exists(payload))
        {
            Console.Error.WriteLine("[setup] payload missing: " + payload);
            return 1;
        }

        if (IsAppRunning())
        {
            Console.Error.WriteLine(
                "[setup] AI Cost Management is currently running. Close it first, then run setup again. Nothing was changed.");
            return 4;
        }

        string installDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "AI-Cost-Management", "App");
        Directory.CreateDirectory(installDir);

        Console.WriteLine("[setup] install dir: " + installDir);
        int ec = ExtractCab(payload, installDir);
        if (ec != 0)
        {
            Console.Error.WriteLine("[setup] extraction failed (expand exit=" + ec + ")");
            return 2;
        }

        string exePath = Path.Combine(installDir, AppExe);
        if (!File.Exists(exePath))
        {
            Console.Error.WriteLine("[setup] executable missing after extraction: " + exePath);
            return 3;
        }

        try
        {
            CreateShortcut(exePath);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("[setup] shortcut failed (non-fatal): " + ex.Message);
        }

        Console.WriteLine("[setup] OK. installed: " + exePath);
        Console.WriteLine("[setup] user data stays at %APPDATA%\\AI-Cost-Management\\data");
        return 0;
    }

    static bool IsAppRunning()
    {
        foreach (Process p in Process.GetProcessesByName("AI Cost Management"))
        {
            try { if (!p.HasExited) return true; } catch { }
        }
        return false;
    }

    static int ExtractCab(string cab, string dest)
    {
        string expand = Path.Combine(Environment.SystemDirectory, "expand.exe");
        if (!File.Exists(expand)) return -99;
        ProcessStartInfo psi = new ProcessStartInfo(
            expand, "\"" + cab + "\" -F:* \"" + dest + "\"");
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.WindowStyle = ProcessWindowStyle.Hidden;
        using (Process p = Process.Start(psi))
        {
            p.WaitForExit();
            return p.ExitCode;
        }
    }

    static void CreateShortcut(string exePath)
    {
        string startMenu = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.Programs), ShortcutName);
        Type t = Type.GetTypeFromProgID("WScript.Shell");
        if (t == null) throw new InvalidOperationException("WScript.Shell unavailable");
        object shell = Activator.CreateInstance(t);
        object lnk = t.InvokeMember(
            "CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { startMenu });
        Type lt = lnk.GetType();
        lt.InvokeMember("TargetPath", BindingFlags.SetProperty, null, lnk, new object[] { exePath });
        lt.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, lnk,
                        new object[] { Path.GetDirectoryName(exePath) });
        lt.InvokeMember("Description", BindingFlags.SetProperty, null, lnk,
                        new object[] { "AI Cost Management" });
        lt.InvokeMember("Save", BindingFlags.InvokeMethod, null, lnk, null);
        Marshal.FinalReleaseComObject(lnk);
        Marshal.FinalReleaseComObject(shell);
    }
}