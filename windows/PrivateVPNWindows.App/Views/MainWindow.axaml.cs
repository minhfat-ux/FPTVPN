using Avalonia.Controls;
using Avalonia.Interactivity;

namespace VpnFlow.App.Views;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        HostContent.Content = new MainView();
    }

    private void OnNavMainClick(object? sender, RoutedEventArgs e) =>
        HostContent.Content = new MainView();

    private void OnNavLoginClick(object? sender, RoutedEventArgs e) =>
        HostContent.Content = new LoginView();

    private void OnNavSettingsClick(object? sender, RoutedEventArgs e) =>
        HostContent.Content = new SettingsView();

    private void OnNavUpdateClick(object? sender, RoutedEventArgs e) =>
        HostContent.Content = new ForceUpdateView();
}
