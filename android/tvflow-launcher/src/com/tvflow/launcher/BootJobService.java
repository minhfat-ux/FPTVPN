package com.tvflow.launcher;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.util.Log;

/** Chạy sau reboot (JobScheduler persisted) để mở TVFlow Home chắc chắn. */
public class BootJobService extends JobService {
    @Override public boolean onStartJob(JobParameters params) {
        Log.i("TVFlowAuto", "job persisted chay -> mo TVFlow Home");
        AutoStartReceiver.open(this);
        jobFinished(params, false);
        return false;
    }

    @Override public boolean onStopJob(JobParameters params) { return false; }
}
