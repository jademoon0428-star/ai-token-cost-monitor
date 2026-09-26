using System;
using System.Runtime.InteropServices;
using System.Threading;

internal static class StopHelper
{
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool FreeConsole();
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AttachConsole(uint dwProcessId);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GenerateConsoleCtrlEvent(uint dwCtrlEvent, uint dwProcessGroupId);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetConsoleCtrlHandler(ConsoleCtrlHandlerDelegate handler, bool add);

    private delegate bool ConsoleCtrlHandlerDelegate(uint dwCtrlType);

    private static readonly ConsoleCtrlHandlerDelegate Handle = new ConsoleCtrlHandlerDelegate(OnCtrl);

    private static bool OnCtrl(uint type)
    {
        return false;
    }

    private static int Main(string[] args)
    {
        if (args.Length == 0)
        {
            Console.WriteLine("usage: stop-helper <pid of AI Cost Management.exe>");
            return 2;
        }

        uint pid;
        if (!uint.TryParse(args[0], out pid))
        {
            return 2;
        }

        SetConsoleCtrlHandler(Handle, true);

        FreeConsole();
        if (!AttachConsole(pid))
        {
            FreeConsole();
            Console.WriteLine("stop-helper: AttachConsole failed err=" + Marshal.GetLastWin32Error());
            return 1;
        }

        GenerateConsoleCtrlEvent(0, 0);

        Thread.Sleep(1500);
        FreeConsole();
        return 0;
    }
}