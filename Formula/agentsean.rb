# Homebrew formula. Prefer `brew install --build-from-source ./Formula/agentsean.rb`
# until the first tagged release is on GitHub.
class Agentsean < Formula
  desc "The SEO engineer that never sleeps"
  homepage "https://github.com/seziro-team/agentsean"
  url "https://github.com/seziro-team/agentsean/archive/refs/heads/main.tar.gz"
  version "2026.9.0"
  license "AGPL-3.0-only"

  depends_on "node@22"
  depends_on "pnpm"

  def install
    ENV["PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD"] = "1"
    system "pnpm", "install", "--frozen-lockfile"
    system "pnpm", "build"
    libexec.install Dir["*"]
    (bin/"sean").write <<~EOS
      #!/bin/bash
      exec "#{Formula["node@22"].opt_bin}/node" "#{libexec}/packages/cli/dist/bin.js" "$@"
    EOS
    bin.install_symlink bin/"sean" => "agentsean"
  end

  service do
    run [opt_bin/"sean", "start", "--foreground", "--host", "127.0.0.1", "--port", "7777"]
    keep_alive true
    working_dir var/"sean"
    environment_variables SEAN_HOME: var/"sean"
    require_root false
  end

  def caveats
    <<~EOS
      Sean binds 127.0.0.1:7777 only. Remote access is Tailscale Serve, never 0.0.0.0.
      First run: sean onboard
      Survive reboot: brew services start agentsean  (or sean service install)
      Chromium is downloaded lazily on first JS render — not at install.
    EOS
  end

  test do
    system bin/"sean", "--version"
  end
end
