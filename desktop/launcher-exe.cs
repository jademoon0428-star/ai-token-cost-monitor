using System;
using System.Diagnostics;
using System.IO;

internal static class Program
{
    private static int Main()
    {
        string exeDir = AppDomain.CurrentDomain.BaseDirectory;
        string nodePath = Path.Combine(exeDir, "runtime", "node.exe");
        string launcherPath = Path.Combine(exeDir, "desktop", "launcher.mjs");

        if (!File.Exists(nodePath))
        {
            Console.Error.WriteLine(
                "AI Cost Management: runtime\\node.exe not found at " + nodePath);
            Console.Error.WriteLine(
                "Please run this EXE from inside the application folder.");
            return 1;
        }

        if (!File.Exists(launcherPath))
        {
            Console.Error.WriteLine(
                "AI Cost Management: desktop\\launcher.mjs not found at " + launcherPath);
            Console.Error.WriteLine(
                "Please run this EXE from inside the application folder.");
            return 1;
        }

        ProcessStartInfo startInfo = new ProcessStartInfo();
        startInfo.FileName = nodePath;
        startInfo.Arguments = "\"" + launcherPath + "\"";
        startInfo.WorkingDirectory = exeDir;
        startInfo.UseShellExecute = false;
        startInfo.CreateNoWindow = false;

        Process child;
        try
        {
            child = Process.Start(startInfo);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(
                "AI Cost Management: failed to start runtime\\node.exe: " + ex.Message);
            return 1;
        }

        child.WaitForExit();
        return child.ExitCode;
    }
}