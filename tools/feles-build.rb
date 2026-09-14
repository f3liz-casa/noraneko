#!/usr/bin/env ruby
# SPDX-License-Identifier: MPL-2.0
#
#   deno task feles-build <command>   (= ruby tools/feles-build.rb <command>)
#
# 建てる段を順に呼ぶだけ。中身は tools/lib/ に。

# mac の /usr/bin/ruby は 2.6。素っ気ない SyntaxError になる前に、どうすればいいか言っておく。
# (3.1 は endless method の書き方から。CI の ubuntu-latest は 3.2 なのでそのまま通る)
abort "ruby #{RUBY_VERSION} は古い(3.1 以上が要る)。`mise install` で mise.toml の版が入る" if RUBY_VERSION < "3.1"

require_relative "lib/browser_launcher"
require_relative "lib/builder"
require_relative "lib/dev_browser"
require_relative "lib/dev_env_manager"
require_relative "lib/dev_server"
require_relative "lib/initializer"
require_relative "lib/injector"
require_relative "lib/omni"
require_relative "lib/patcher"
require_relative "lib/symlinker"
require_relative "lib/update"
require_relative "lib/utils"
require_relative "lib/xhtml"

module FelesBuild
  LOGGER = Utils::Logger.new("feles-build")

  USAGE = <<~TXT
    Usage: deno task feles-build <command> [options]

    Commands:
      dev        Run the development workflow
      stage      Build production assets and run browser in dev mode
      build      Run the production build workflow (--phase before-mach|after-mach)
      stop       Close the dev browser started from this checkout
      misc       Misc commands (e.g. 'misc patch --action apply', 'misc writeVersion')
  TXT

  def self.build_id
    id = Update.build_id
    LOGGER.info "Generated build id: #{id}"
    id
  end

  # dev と stage で同じ道。omni.ja は、ほどいてから触って、最後に結ぶ。
  def self.prepare(mode)
    Initializer.run
    Omni.open
    Patcher.run("apply")
    Symlinker.run
    Builder.run(mode, build_id)
    Injector.run(mode)
    Xhtml.inject(Omni.root, dev: true)
    Omni.seal
    Initializer.resign_mac_app # 封を結び直すのは、omni.ja を最後に触ったあと
    DevEnvManager.setup
  end

  # 建てて、開いて、閉じたら一緒に片づける(vite だけ残さない)。
  def self.serve_and_launch
    # HUP は Windows に無い(Signal.list にも載らない)。知っている名前だけ捕まえる
    %w[INT TERM HUP].select { |name| Signal.list.key?(name) }.each do |signal|
      Signal.trap(signal) do
        LOGGER.info "Shutting down (SIG#{signal})..."
        DevServer.shutdown
        exit 130
      end
    end

    DevServer.run
    LOGGER.success "Dev servers are ready."
    BrowserLauncher.run
  ensure
    LOGGER.info "Browser closed; stopping dev servers."
    DevServer.shutdown
  end

  def self.run_build(phase)
    case phase
    when "before-mach"
      Symlinker.run
      Builder.run("production", build_id)
    when "after-mach"
      Xhtml.inject(Defines::PROD_BIN_DIR, dev: false)
    when nil
      abort "Error: --phase is required for the build command."
    else
      abort "Unknown phase: #{phase}"
    end
  end

  def self.run_misc(argv)
    case argv.shift
    when "patch"
      action = flag(argv, "--action") || "apply"
      Omni.open # patch は omni の中にも当たるので、ほどいてから
      Patcher.run(action)
      Omni.seal if action == "apply"
    when "writeVersion" then Update.write_version("static/gecko")
    else abort USAGE
    end
  end

  def self.flag(argv, name)
    index = argv.index(name)
    index ? argv[index + 1] : nil
  end

  def self.main(argv)
    command = argv.shift
    return puts USAGE if argv.include?("--help") || argv.include?("-h")

    case command
    when "dev"
      LOGGER.info "Starting development environment..."
      prepare("dev")
      serve_and_launch
    when "stage"
      LOGGER.info "Starting staged production build (production assets) with browser in dev mode..."
      prepare("stage")
      serve_and_launch
    when "build" then run_build(flag(argv, "--phase"))
    when "stop" then DevBrowser.stop
    when "misc" then run_misc(argv)
    when "--help", "-h", nil then puts USAGE
    else
      LOGGER.error "Unknown command: #{command}"
      abort USAGE
    end
  end
end

begin
  FelesBuild.main(ARGV)
rescue => e
  FelesBuild::LOGGER.error "Unhandled error: #{e.message}"
  warn e.backtrace.first(5).join("\n") if ENV["DEBUG"]
  exit 1
end
