using System.Runtime.InteropServices;

namespace LmuTelemetryRecorder;

/// <summary>
/// Locates the vehicle arrays inside the mapped buffers by signature-scanning for the
/// zero-filled ASCII name fields, rather than trusting a hand-written struct size.
/// A single wrong field in <see cref="Rf2VehicleTelemetry"/> would otherwise shift the whole
/// array and yield plausible-looking garbage.
/// </summary>
internal sealed record Rf2Calibration(int Offset, int Stride, int SampleCount)
{
    public static unsafe Rf2Calibration? Detect(
        Rf2Buffer buffer,
        int idMax,
        (int Offset, int Length)[] nameFields,
        int minStride,
        int maxStride,
        int fallbackStride)
    {
        var basePtr = (byte*)buffer.BasePtr;
        var limit = (int)buffer.Capacity - maxStride;
        var candidates = new List<int>();

        var probeEnd = nameFields.Max(f => f.Offset + f.Length);

        for (var p = 0; p < limit; p += 4)
        {
            var id = Marshal.ReadInt32(buffer.BasePtr, p);
            if (id < 0 || id > idMax)
            {
                continue;
            }

            var ok = true;
            foreach (var (offset, length) in nameFields)
            {
                if (!LooksLikeName(basePtr + p + offset, length))
                {
                    ok = false;
                    break;
                }
            }

            if (ok)
            {
                candidates.Add(p);
                p += probeEnd - 4;
            }
        }

        if (candidates.Count == 0)
        {
            return null;
        }

        // Stride can only be measured from the gap between two vehicles; running alone leaves
        // a single signature, so fall back to the size-validated struct stride.
        if (candidates.Count == 1)
        {
            return new Rf2Calibration(candidates[0], fallbackStride, 1);
        }

        var deltas = new Dictionary<int, int>();
        for (var i = 1; i < candidates.Count; i++)
        {
            var delta = candidates[i] - candidates[i - 1];
            if (delta < minStride || delta > maxStride)
            {
                continue;
            }

            deltas[delta] = deltas.GetValueOrDefault(delta) + 1;
        }

        if (deltas.Count == 0)
        {
            return new Rf2Calibration(candidates[0], fallbackStride, candidates.Count);
        }

        var stride = deltas.OrderByDescending(kv => kv.Value).First().Key;

        // Walk back to the first entry that is stride-aligned with the run.
        var first = candidates[0];
        foreach (var candidate in candidates)
        {
            if (candidates.Count(c => (c - candidate) % stride == 0 && c >= candidate) >= 2)
            {
                first = candidate;
                break;
            }
        }

        return new Rf2Calibration(first, stride, candidates.Count);
    }

    private static unsafe bool LooksLikeName(byte* p, int maxLength)
    {
        var i = 0;
        for (; i < maxLength; i++)
        {
            var b = p[i];
            if (b == 0)
            {
                break;
            }

            if (b is < 32 or > 126)
            {
                return false;
            }
        }

        if (i == 0 || i == maxLength)
        {
            return false;
        }

        for (var j = i; j < maxLength; j++)
        {
            if (p[j] != 0)
            {
                return false;
            }
        }

        return true;
    }

    public static Rf2Calibration? DetectTelemetry(Rf2Buffer buffer) =>
        Detect(
            buffer,
            idMax: 100_000,
            nameFields: [(32, 64), (96, 64)],
            minStride: 600,
            maxStride: 6000,
            fallbackStride: System.Runtime.InteropServices.Marshal.SizeOf<Rf2VehicleTelemetry>());

    public static Rf2Calibration? DetectScoring(Rf2Buffer buffer) =>
        Detect(
            buffer,
            idMax: 100_000,
            nameFields: [(4, 32), (36, 64)],
            minStride: 300,
            maxStride: 2000,
            fallbackStride: System.Runtime.InteropServices.Marshal.SizeOf<Rf2VehicleScoring>());
}
