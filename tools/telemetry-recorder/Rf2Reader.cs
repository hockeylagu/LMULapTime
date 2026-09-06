using System.IO.MemoryMappedFiles;
using System.Runtime.InteropServices;

namespace LmuTelemetryRecorder;

/// <summary>
/// Read-only view over one of the plugin's mapped buffers, with tear-safe access.
/// </summary>
internal sealed unsafe class Rf2Buffer : IDisposable
{
    private readonly MemoryMappedFile _mmf;
    private readonly MemoryMappedViewAccessor _view;
    private byte* _ptr;

    public string Name { get; }

    public long Capacity => _view.Capacity;

    private Rf2Buffer(string name, MemoryMappedFile mmf, MemoryMappedViewAccessor view)
    {
        Name = name;
        _mmf = mmf;
        _view = view;
        _view.SafeMemoryMappedViewHandle.AcquirePointer(ref _ptr);
    }

    public static Rf2Buffer? TryOpen(string name)
    {
        foreach (var candidate in new[] { name, @"Global\" + name })
        {
            try
            {
                var mmf = MemoryMappedFile.OpenExisting(candidate, MemoryMappedFileRights.Read);
                var view = mmf.CreateViewAccessor(0, 0, MemoryMappedFileAccess.Read);
                return new Rf2Buffer(candidate, mmf, view);
            }
            catch (FileNotFoundException)
            {
            }
            catch (UnauthorizedAccessException)
            {
            }
        }

        return null;
    }

    public uint VersionBegin => *(uint*)_ptr;

    public uint VersionEnd => *(uint*)(_ptr + 4);

    public IntPtr BasePtr => (IntPtr)_ptr;

    /// <summary>
    /// Runs <paramref name="extract"/> against the raw buffer, retrying while the plugin's
    /// double-buffer version counters disagree. Torn frames would otherwise silently poison
    /// any correlation analysis downstream.
    /// </summary>
    public bool TryReadCoherent<T>(Func<IntPtr, T> extract, out T result, int maxAttempts = 16)
    {
        for (var attempt = 0; attempt < maxAttempts; attempt++)
        {
            var begin = VersionBegin;
            Thread.MemoryBarrier();

            var candidate = extract((IntPtr)_ptr);

            Thread.MemoryBarrier();
            var end = VersionEnd;

            if (begin == end)
            {
                result = candidate;
                return true;
            }
        }

        result = default!;
        return false;
    }

    public void Dispose()
    {
        if (_ptr != null)
        {
            _view.SafeMemoryMappedViewHandle.ReleasePointer();
            _ptr = null;
        }

        _view.Dispose();
        _mmf.Dispose();
    }
}

internal static class Rf2Layout
{
    public static readonly int TelemetryVehiclesOffset =
        (int)Marshal.OffsetOf<Rf2Telemetry>(nameof(Rf2Telemetry.Vehicles));

    public static readonly int TelemetryVehicleStride = Marshal.SizeOf<Rf2VehicleTelemetry>();

    public static readonly int TelemetryNumVehiclesOffset =
        (int)Marshal.OffsetOf<Rf2Telemetry>(nameof(Rf2Telemetry.NumVehicles));

    public static readonly int ScoringInfoOffset =
        (int)Marshal.OffsetOf<Rf2Scoring>(nameof(Rf2Scoring.ScoringInfo));

    public static readonly int ScoringVehiclesOffset =
        (int)Marshal.OffsetOf<Rf2Scoring>(nameof(Rf2Scoring.Vehicles));

    public static readonly int ScoringVehicleStride = Marshal.SizeOf<Rf2VehicleScoring>();

    /// <summary>Offset of ScoringInfo.NumVehicles within the scoring buffer.</summary>
    public static readonly int ScoringNumVehiclesOffset =
        ScoringInfoOffset + (int)Marshal.OffsetOf<Rf2ScoringInfo>(nameof(Rf2ScoringInfo.NumVehicles));

    public static int ReadInt(IntPtr basePtr, int offset) => Marshal.ReadInt32(basePtr, offset);

    public static Rf2VehicleTelemetry ReadTelemetryVehicle(IntPtr basePtr, Rf2Calibration cal, int index) =>
        Marshal.PtrToStructure<Rf2VehicleTelemetry>(basePtr + cal.Offset + (index * cal.Stride));

    public static Rf2ScoringInfo ReadScoringInfo(IntPtr basePtr) =>
        Marshal.PtrToStructure<Rf2ScoringInfo>(basePtr + ScoringInfoOffset);

    public static Rf2VehicleScoring ReadScoringVehicle(IntPtr basePtr, Rf2Calibration cal, int index) =>
        Marshal.PtrToStructure<Rf2VehicleScoring>(basePtr + cal.Offset + (index * cal.Stride));

    public static string AsciiZ(byte[]? raw)
    {
        if (raw is null)
        {
            return string.Empty;
        }

        var end = Array.IndexOf(raw, (byte)0);
        var length = end < 0 ? raw.Length : end;
        return System.Text.Encoding.ASCII.GetString(raw, 0, length).Trim();
    }

    // Sizes taken from TheIronWolfModding/rF2SharedMemoryMapPlugin rF2Data.cs.
    private static readonly (string Name, int Actual, int Expected)[] SizeChecks =
    [
        (nameof(Rf2Wheel), Marshal.SizeOf<Rf2Wheel>(), 260),
        (nameof(Rf2VehicleTelemetry), Marshal.SizeOf<Rf2VehicleTelemetry>(), 1888),
        (nameof(Rf2VehicleScoring), Marshal.SizeOf<Rf2VehicleScoring>(), 584),
        (nameof(Rf2ScoringInfo), Marshal.SizeOf<Rf2ScoringInfo>(), 548),
        (nameof(Rf2Telemetry), Marshal.SizeOf<Rf2Telemetry>(), 241680),
        (nameof(Rf2Scoring), Marshal.SizeOf<Rf2Scoring>(), 75312)
    ];

    public static bool Validate(TextWriter output)
    {
        var ok = true;

        foreach (var (name, actual, expected) in SizeChecks)
        {
            if (actual != expected)
            {
                output.WriteLine($"  LAYOUT ERROR: sizeof({name}) = {actual}, expected {expected}");
                ok = false;
            }
        }

        return ok;
    }
}
